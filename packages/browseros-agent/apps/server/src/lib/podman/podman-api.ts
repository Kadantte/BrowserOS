/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { existsSync } from 'node:fs'
import { readPodmanEnvFile } from './podman-env'
import { buildApiError, PodmanTransportError } from './podman-errors'
import { readMultiplexedStream, readTextStream } from './podman-streams'
import type {
  LogFn,
  PodmanContainerCreateInput,
  PodmanContainerSummary,
  PodmanExecInput,
  PodmanExecResult,
  PodmanTransport,
} from './podman-transport'

type RequestInitWithUnix = RequestInit & { unix?: string }
type UnixFetch = (
  input: string | URL | Request,
  init?: RequestInitWithUnix,
) => Promise<Response>

interface PodmanApiDeps {
  fetch?: UnixFetch
}

interface ExecCreateResponse {
  Id?: string
}

interface ExecInspectResponse {
  ExitCode?: number
}

interface PodmanApiResponse {
  body: Response
  version: string
}

export interface PodmanApiConfig {
  socketPath: string
}

export class PodmanApi implements PodmanTransport {
  private readonly fetchImpl: UnixFetch
  private readonly socketPath: string
  private versionPromise: Promise<string> | null = null

  constructor(config: PodmanApiConfig, deps?: PodmanApiDeps) {
    this.fetchImpl = deps?.fetch ?? (globalThis.fetch as UnixFetch)
    this.socketPath = config.socketPath
  }

  async imageExists(image: string): Promise<boolean> {
    const response = await this.requestVersioned(
      `/images/${encodeName(image)}/exists`,
      { method: 'GET' },
    )

    if (response.body.status === 204) return true
    if (response.body.status === 404) return false

    throw await this.buildResponseError(
      response.body,
      `Failed to check whether image exists: ${image}`,
    )
  }

  async pullImage(image: string, onLog?: LogFn): Promise<void> {
    const query = new URLSearchParams({ reference: image })
    const response = await this.requestVersioned(`/images/pull?${query}`, {
      method: 'POST',
    })
    await this.assertOk(response.body, `Failed to pull image: ${image}`)
    await readTextStream(response.body.body, onLog)
  }

  async loadImage(
    input: { archivePath: string },
    onLog?: LogFn,
  ): Promise<void> {
    if (!existsSync(input.archivePath)) {
      throw new PodmanTransportError(
        `Image archive not found: ${input.archivePath}`,
        'not_found',
        false,
      )
    }

    const response = await this.requestVersioned('/images/load', {
      body: Bun.file(input.archivePath),
      headers: { 'Content-Type': 'application/x-tar' },
      method: 'POST',
    })
    await this.assertOk(
      response.body,
      `Failed to load image: ${input.archivePath}`,
    )
    await readTextStream(response.body.body, onLog)
  }

  async createContainer(
    input: PodmanContainerCreateInput,
  ): Promise<{ id: string }> {
    const body = await buildContainerCreateBody(input)
    const response = await this.requestVersioned('/containers/create', {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    await this.assertOk(
      response.body,
      `Failed to create container: ${input.name}`,
    )

    const parsed = (await response.body.json()) as { Id?: string; id?: string }
    const id = parsed.Id ?? parsed.id
    if (!id) {
      throw new PodmanTransportError(
        `Podman API returned no container ID for ${input.name}`,
        'api_error',
        false,
      )
    }

    return { id }
  }

  async startContainer(name: string): Promise<void> {
    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}/start`,
      { method: 'POST' },
    )
    if (response.body.ok || response.body.status === 304) return
    throw await this.buildResponseError(
      response.body,
      `Failed to start container: ${name}`,
    )
  }

  async stopContainer(
    name: string,
    options?: { ignore?: boolean; timeoutSeconds?: number },
  ): Promise<void> {
    const query = new URLSearchParams()
    if (options?.ignore) query.set('ignore', 'true')
    if (options?.timeoutSeconds !== undefined) {
      query.set('timeout', String(options.timeoutSeconds))
    }

    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}/stop${suffixQuery(query)}`,
      { method: 'POST' },
    )

    if (response.body.ok || response.body.status === 304) return
    if (options?.ignore && response.body.status === 404) return
    throw await this.buildResponseError(
      response.body,
      `Failed to stop container: ${name}`,
    )
  }

  async removeContainer(
    name: string,
    options?: { force?: boolean; ignore?: boolean },
  ): Promise<void> {
    const query = new URLSearchParams()
    if (options?.force) query.set('force', 'true')
    if (options?.ignore) query.set('ignore', 'true')

    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}${suffixQuery(query)}`,
      { method: 'DELETE' },
    )

    if (response.body.ok) return
    if (options?.ignore && response.body.status === 404) return
    throw await this.buildResponseError(
      response.body,
      `Failed to remove container: ${name}`,
    )
  }

  async inspectContainer(name: string): Promise<unknown> {
    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}/json`,
      { method: 'GET' },
    )
    await this.assertOk(response.body, `Failed to inspect container: ${name}`)
    return response.body.json()
  }

  async listContainers(options?: {
    all?: boolean
  }): Promise<PodmanContainerSummary[]> {
    const query = new URLSearchParams()
    if (options?.all) query.set('all', 'true')

    const response = await this.requestVersioned(
      `/containers/json${suffixQuery(query)}`,
      { method: 'GET' },
    )
    await this.assertOk(response.body, 'Failed to list containers')

    const parsed = (await response.body.json()) as Array<
      Record<string, unknown>
    >
    return parsed.map((entry) => ({
      id: readString(entry.Id, entry.ID, entry.id),
      image: readString(entry.Image, entry.image, entry.ImageID),
      name: readName(entry.Names, entry.Name, entry.name),
      state: readString(entry.State, entry.state, entry.Status),
      status: readOptionalString(entry.Status, entry.status),
    }))
  }

  async getLogs(name: string, options?: { tail?: number }): Promise<string[]> {
    const lines: string[] = []
    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}/logs${buildLogsQuery(options)}`,
      { method: 'GET' },
    )
    await this.assertOk(
      response.body,
      `Failed to read logs for container: ${name}`,
    )
    await readTextStream(response.body.body, (line) => lines.push(line))
    return lines
  }

  async tailLogs(name: string, onLog: LogFn): Promise<() => void> {
    const controller = new AbortController()
    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}/logs${buildLogsQuery({ tail: 0 }, true)}`,
      {
        method: 'GET',
        signal: controller.signal,
      },
    )
    await this.assertOk(
      response.body,
      `Failed to follow logs for container: ${name}`,
    )

    void readTextStream(response.body.body, onLog).catch((error) => {
      if (controller.signal.aborted) return
      throw error
    })

    return () => controller.abort()
  }

  async exec(
    name: string,
    input: PodmanExecInput,
    onLog?: LogFn,
  ): Promise<PodmanExecResult> {
    const execId = await this.createExec(name, input)
    const startResponse = await this.requestVersioned(
      `/exec/${encodeName(execId)}/start`,
      {
        body: JSON.stringify({ Detach: false, Tty: false }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )
    await this.assertOk(
      startResponse.body,
      `Failed to start exec session: ${execId}`,
    )

    const { stdout, stderr } = await readMultiplexedStream(
      startResponse.body.body,
      onLog,
      onLog,
    )
    const inspectResponse = await this.requestVersioned(
      `/exec/${encodeName(execId)}/json`,
      { method: 'GET' },
    )
    await this.assertOk(
      inspectResponse.body,
      `Failed to inspect exec session: ${execId}`,
    )

    const inspectBody =
      (await inspectResponse.body.json()) as ExecInspectResponse
    return {
      exitCode: inspectBody.ExitCode ?? 0,
      stderr,
      stdout,
    }
  }

  private async createExec(
    name: string,
    input: PodmanExecInput,
  ): Promise<string> {
    const response = await this.requestVersioned(
      `/containers/${encodeName(name)}/exec`,
      {
        body: JSON.stringify({
          AttachStderr: true,
          AttachStdout: true,
          Cmd: input.command,
          Env: buildEnvList(input.env),
          Tty: false,
          WorkingDir: input.workingDir,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )
    await this.assertOk(
      response.body,
      `Failed to create exec session for ${name}`,
    )

    const parsed = (await response.body.json()) as ExecCreateResponse
    if (parsed.Id) return parsed.Id

    throw new PodmanTransportError(
      `Podman API returned no exec ID for container ${name}`,
      'api_error',
      false,
    )
  }

  private async requestVersioned(
    path: string,
    init: RequestInitWithUnix,
  ): Promise<PodmanApiResponse> {
    const version = await this.getVersion()
    const body = await this.fetchPodman(
      `http://localhost/${version}/libpod${path}`,
      init,
    )
    return { body, version }
  }

  private async getVersion(): Promise<string> {
    if (!this.versionPromise) {
      this.versionPromise = this.fetchPodman('http://localhost/libpod/_ping', {
        method: 'GET',
      })
        .then((response) => {
          if (!response.ok) {
            throw new PodmanTransportError(
              `Podman API ping failed with status ${response.status}`,
              'transport_unavailable',
              true,
              { statusCode: response.status },
            )
          }

          const header = response.headers.get('Libpod-API-Version')
          return header ? `v${header.replace(/^v/, '')}` : 'v5.0.0'
        })
        .catch((error) => {
          this.versionPromise = null
          throw error
        })
    }

    return this.versionPromise
  }

  private async fetchPodman(
    url: string,
    init: RequestInitWithUnix,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        unix: this.socketPath,
      })
    } catch (error) {
      throw new PodmanTransportError(
        `Failed to reach Podman API on ${this.socketPath}`,
        'transport_unavailable',
        true,
        undefined,
        { cause: error },
      )
    }
  }

  private async assertOk(response: Response, message: string): Promise<void> {
    if (response.ok) return
    throw await this.buildResponseError(response, message)
  }

  private async buildResponseError(
    response: Response,
    message: string,
  ): Promise<PodmanTransportError> {
    const responseBody = await response.text()
    return buildApiError(
      `${message} (${response.status})`,
      response.status,
      responseBody,
    )
  }
}

export async function buildContainerCreateBody(
  input: PodmanContainerCreateInput,
): Promise<Record<string, unknown>> {
  const env = {
    ...(await readPodmanEnvFile(input.envFilePath)),
    ...(input.env ?? {}),
  }

  return {
    command: input.command,
    env,
    healthconfig: buildHealthConfig(input),
    hostadd: input.addHosts,
    image: input.image,
    mounts: (input.mounts ?? []).map((mount) => ({
      ReadOnly: mount.readOnly,
      Source: mount.source,
      Target: mount.target,
      Type: 'bind',
    })),
    name: input.name,
    portmappings: (input.portMappings ?? []).map((mapping) => ({
      container_port: mapping.containerPort,
      host_ip: mapping.hostIp,
      host_port: mapping.hostPort,
      protocol: mapping.protocol ?? 'tcp',
    })),
    restart_policy: input.restartPolicy,
  }
}

function buildEnvList(env?: Record<string, string>): string[] {
  return Object.entries(env ?? {}).map(([key, value]) => `${key}=${value}`)
}

function buildHealthConfig(
  input: PodmanContainerCreateInput,
): Record<string, unknown> | undefined {
  if (!input.healthcheck) return undefined

  return {
    Interval: input.healthcheck.interval,
    Retries: input.healthcheck.retries,
    Test: input.healthcheck.test,
    Timeout: input.healthcheck.timeout,
  }
}

function buildLogsQuery(options?: { tail?: number }, follow = false): string {
  const query = new URLSearchParams({
    stderr: 'true',
    stdout: 'true',
  })

  if (follow) query.set('follow', 'true')
  if (options?.tail !== undefined) {
    query.set('tail', String(options.tail))
  }

  return suffixQuery(query)
}

function suffixQuery(query: URLSearchParams): string {
  const value = query.toString()
  return value ? `?${value}` : ''
}

function encodeName(value: string): string {
  return encodeURIComponent(value)
}

function readName(...values: unknown[]): string {
  for (const value of values) {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0]
    }
    if (typeof value === 'string' && value.trim()) return value
  }

  return ''
}

function readOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }

  return undefined
}

function readString(...values: unknown[]): string {
  return readOptionalString(...values) ?? ''
}
