/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildContainerCreateBody,
  PodmanApi,
} from '../../../src/lib/podman/podman-api'
import { PodmanTransportError } from '../../../src/lib/podman/podman-errors'

describe('PodmanApi', () => {
  afterEach(() => {
    mock.restore()
  })

  it('checks image existence over fetch with a unix socket', async () => {
    const fetchMock = mock<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'Libpod-API-Version': '5.4.1' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))

    const api = new PodmanApi(
      { socketPath: '/tmp/podman.sock' },
      { fetch: fetchMock as never },
    )

    await expect(api.imageExists('hello-world:latest')).resolves.toBe(true)
    await expect(api.imageExists('missing:latest')).resolves.toBe(false)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost/libpod/_ping')
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost/v5.4.1/libpod/images/hello-world%3Alatest/exists',
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      unix: '/tmp/podman.sock',
    })
  })

  it('builds a container create body from typed input', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'podman-api-test-'))
    const envFilePath = join(tempDir, '.env')
    writeFileSync(envFilePath, 'FROM_FILE=value\nSHARED=env-file\n')

    try {
      await expect(
        buildContainerCreateBody({
          name: 'gateway',
          image: 'busybox:latest',
          command: ['sleep', '60'],
          env: { SHARED: 'inline', TOKEN: 'abc' },
          envFilePath,
          mounts: [
            { source: '/guest/home', target: '/home/node', readOnly: true },
          ],
          portMappings: [
            { hostIp: '127.0.0.1', hostPort: 18789, containerPort: 18789 },
          ],
          restartPolicy: 'unless-stopped',
          addHosts: ['host.containers.internal:host-gateway'],
          healthcheck: {
            test: ['CMD', 'curl', '-sf', 'http://127.0.0.1:18789/healthz'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
          },
        }),
      ).resolves.toEqual({
        command: ['sleep', '60'],
        env: {
          FROM_FILE: 'value',
          SHARED: 'inline',
          TOKEN: 'abc',
        },
        healthconfig: {
          Interval: '30s',
          Retries: 3,
          Test: ['CMD', 'curl', '-sf', 'http://127.0.0.1:18789/healthz'],
          Timeout: '10s',
        },
        hostadd: ['host.containers.internal:host-gateway'],
        image: 'busybox:latest',
        mounts: [
          {
            ReadOnly: true,
            Source: '/guest/home',
            Target: '/home/node',
            Type: 'bind',
          },
        ],
        name: 'gateway',
        portmappings: [
          {
            container_port: 18789,
            host_ip: '127.0.0.1',
            host_port: 18789,
            protocol: 'tcp',
          },
        ],
        restart_policy: 'unless-stopped',
      })
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('surfaces env file read failures when building a container create body', async () => {
    await expect(
      buildContainerCreateBody({
        name: 'gateway',
        image: 'busybox:latest',
        envFilePath: '/definitely/missing/.env',
      }),
    ).rejects.toBeInstanceOf(Error)
  })

  it('creates containers with libpod JSON requests', async () => {
    const fetchMock = mock<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'Libpod-API-Version': '5.0.0' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          Id: 'container-123',
        }),
      )

    const api = new PodmanApi(
      { socketPath: '/tmp/podman.sock' },
      { fetch: fetchMock as never },
    )

    await expect(
      api.createContainer({
        name: 'gateway',
        image: 'busybox:latest',
        command: ['sleep', '60'],
      }),
    ).resolves.toEqual({ id: 'container-123' })

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost/v5.0.0/libpod/containers/create',
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      unix: '/tmp/podman.sock',
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      command: ['sleep', '60'],
      env: {},
      healthconfig: undefined,
      hostadd: undefined,
      image: 'busybox:latest',
      mounts: [],
      name: 'gateway',
      portmappings: [],
      restart_policy: undefined,
    })
  })

  it('parses multiplexed exec output and returns the exec exit code', async () => {
    const fetchMock = mock<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'Libpod-API-Version': '5.0.0' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(Response.json({ Id: 'exec-1' }))
      .mockResolvedValueOnce(
        new Response(createMultiplexedStream(), {
          headers: {
            'Content-Type': 'application/vnd.docker.multiplexed-stream',
          },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(Response.json({ ExitCode: 17 }))

    const api = new PodmanApi(
      { socketPath: '/tmp/podman.sock' },
      { fetch: fetchMock as never },
    )
    const lines: string[] = []

    await expect(
      api.exec(
        'gateway',
        {
          command: ['node', 'dist/index.js', 'agents', 'list', '--json'],
          env: { NODE_ENV: 'production' },
          workingDir: '/home/node',
        },
        (line) => lines.push(line),
      ),
    ).resolves.toEqual({
      exitCode: 17,
      stderr: 'stderr line\n',
      stdout: 'stdout line\n',
    })

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost/v5.0.0/libpod/containers/gateway/exec',
    )
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      AttachStderr: true,
      AttachStdout: true,
      Cmd: ['node', 'dist/index.js', 'agents', 'list', '--json'],
      Env: ['NODE_ENV=production'],
      Tty: false,
      WorkingDir: '/home/node',
    })
    expect(lines).toEqual(['stdout line', 'stderr line'])
  })

  it('maps HTTP errors into PodmanTransportError', async () => {
    const fetchMock = mock<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'Libpod-API-Version': '5.0.0' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))

    const api = new PodmanApi(
      { socketPath: '/tmp/podman.sock' },
      { fetch: fetchMock as never },
    )

    await expect(api.inspectContainer('missing')).rejects.toBeInstanceOf(
      PodmanTransportError,
    )
  })
})

function createMultiplexedStream(): ReadableStream<Uint8Array> {
  const stdout = encodeFrame(1, 'stdout line\n')
  const stderr = encodeFrame(2, 'stderr line\n')

  return new ReadableStream({
    start(controller) {
      controller.enqueue(stdout.slice(0, 5))
      controller.enqueue(concat(stdout.slice(5), stderr))
      controller.close()
    },
  })
}

function encodeFrame(streamType: number, text: string): Uint8Array {
  const payload = new TextEncoder().encode(text)
  const header = new Uint8Array(8)
  header[0] = streamType
  header[4] = (payload.length >>> 24) & 0xff
  header[5] = (payload.length >>> 16) & 0xff
  header[6] = (payload.length >>> 8) & 0xff
  header[7] = payload.length & 0xff
  return concat(header, payload)
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length)
  combined.set(left)
  combined.set(right, left.length)
  return combined
}
