/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PodmanTransportError } from '../../../src/lib/podman/podman-errors'
import {
  buildPodmanCreateArgs,
  buildPodmanExecArgs,
  buildPodmanShellCommand,
  PodmanShell,
} from '../../../src/lib/podman/podman-shell'

describe('PodmanShell', () => {
  afterEach(() => {
    mock.restore()
  })

  it('builds limactl shell commands in automation mode', () => {
    expect(
      buildPodmanShellCommand('limactl', 'browseros-vm', [
        'ps',
        '--format',
        'json',
      ]),
    ).toEqual([
      'limactl',
      'shell',
      '--tty=false',
      'browseros-vm',
      '--',
      'podman',
      'ps',
      '--format',
      'json',
    ])
  })

  it('returns true when podman image exists exits zero', async () => {
    const spawn = createSpawnMock([{ exitCode: 0 }])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })

    await expect(shell.imageExists('hello-world:latest')).resolves.toBe(true)
  })

  it('returns false when podman image exists exits one without stderr', async () => {
    const spawn = createSpawnMock([{ exitCode: 1 }])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })

    await expect(shell.imageExists('hello-world:latest')).resolves.toBe(false)
  })

  it('streams pull progress and throws typed errors on failure', async () => {
    const spawn = createSpawnMock([
      {
        exitCode: 125,
        stderr: 'Error: connection refused\n',
        stdout: 'Trying to pull...\n',
      },
    ])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })
    const lines: string[] = []

    await expect(
      shell.pullImage('busybox:latest', (line) => lines.push(line)),
    ).rejects.toBeInstanceOf(PodmanTransportError)

    expect(lines).toEqual(['Trying to pull...', 'Error: connection refused'])
  })

  it('builds create arguments from the typed container input', () => {
    expect(
      buildPodmanCreateArgs({
        name: 'gateway',
        image: 'ghcr.io/openclaw/openclaw:latest',
        command: ['node', 'dist/index.js', 'gateway'],
        env: { HOME: '/home/node', NODE_ENV: 'production' },
        envFilePath: '/guest/.env',
        mounts: [{ source: '/guest/home', target: '/home/node' }],
        portMappings: [
          {
            hostIp: '127.0.0.1',
            hostPort: 18789,
            containerPort: 18789,
          },
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
    ).toEqual([
      'create',
      '--name',
      'gateway',
      '--restart',
      'unless-stopped',
      '--env-file',
      '/guest/.env',
      '-e',
      'HOME=/home/node',
      '-e',
      'NODE_ENV=production',
      '-v',
      '/guest/home:/home/node',
      '-p',
      '127.0.0.1:18789:18789',
      '--add-host',
      'host.containers.internal:host-gateway',
      '--health-cmd',
      '["CMD","curl","-sf","http://127.0.0.1:18789/healthz"]',
      '--health-interval',
      '30s',
      '--health-timeout',
      '10s',
      '--health-retries',
      '3',
      'ghcr.io/openclaw/openclaw:latest',
      'node',
      'dist/index.js',
      'gateway',
    ])
  })

  it('creates containers and returns the resulting container id', async () => {
    const spawn = createSpawnMock([{ exitCode: 0, stdout: 'container-123\n' }])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })

    await expect(
      shell.createContainer({
        name: 'gateway',
        image: 'busybox:latest',
        command: ['sleep', '60'],
      }),
    ).resolves.toEqual({ id: 'container-123' })

    expect(spawn.mock.calls[0]?.[0]).toEqual([
      'limactl',
      'shell',
      '--tty=false',
      'browseros-vm',
      '--',
      'podman',
      'create',
      '--name',
      'gateway',
      'busybox:latest',
      'sleep',
      '60',
    ])
  })

  it('supports host archive loading via stdin', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'podman-shell-test-'))
    const archivePath = join(tempDir, 'image.tar.gz')
    writeFileSync(archivePath, 'archive')
    const spawn = createSpawnMock([{ exitCode: 0 }])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })

    try {
      await shell.loadImage({ archivePath })
      expect(spawn.mock.calls[0]?.[0]).toEqual([
        'limactl',
        'shell',
        '--tty=false',
        'browseros-vm',
        '--',
        'podman',
        'load',
      ])
      expect(spawn.mock.calls[0]?.[1]?.stdin).toBeDefined()
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('builds exec arguments and returns stdout, stderr, and exit code', async () => {
    const spawn = createSpawnMock([
      {
        exitCode: 17,
        stderr: 'stderr line\n',
        stdout: 'stdout line\n',
      },
    ])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })
    const lines: string[] = []

    expect(
      buildPodmanExecArgs('gateway', {
        command: ['node', 'dist/index.js', 'agents', 'list', '--json'],
        env: { NODE_ENV: 'production' },
        workingDir: '/home/node',
      }),
    ).toEqual([
      'exec',
      '--workdir',
      '/home/node',
      '--env',
      'NODE_ENV=production',
      'gateway',
      'node',
      'dist/index.js',
      'agents',
      'list',
      '--json',
    ])

    await expect(
      shell.exec(
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

    expect(lines).toEqual(['stdout line', 'stderr line'])
  })

  it('parses podman ps JSON into typed container summaries', async () => {
    const spawn = createSpawnMock([
      {
        exitCode: 0,
        stdout: JSON.stringify([
          {
            Id: 'abc123',
            Image: 'busybox:latest',
            Names: ['gateway'],
            State: 'running',
            Status: 'Up 3s',
          },
        ]),
      },
    ])
    const shell = new PodmanShell({ vmName: 'browseros-vm' }, { spawn })

    await expect(shell.listContainers({ all: true })).resolves.toEqual([
      {
        id: 'abc123',
        image: 'busybox:latest',
        name: 'gateway',
        state: 'running',
        status: 'Up 3s',
      },
    ])
  })
})

type SpawnSpec = {
  exitCode?: number
  stderr?: string
  stdout?: string
}

function createSpawnMock(processes: SpawnSpec[]): typeof Bun.spawn {
  return mock((_args: string[], _options?: unknown) => {
    const process = processes.shift() ?? {}
    return createFakeProcess(process) as never
  }) as unknown as typeof Bun.spawn
}

function createFakeProcess(spec: SpawnSpec): ReturnType<typeof Bun.spawn> {
  return {
    exited: Promise.resolve(spec.exitCode ?? 0),
    kill: mock(() => {}),
    stderr: createTextStream(spec.stderr ?? ''),
    stdout: createTextStream(spec.stdout ?? ''),
  } as never
}

function createTextStream(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content))
      controller.close()
    },
  })
}
