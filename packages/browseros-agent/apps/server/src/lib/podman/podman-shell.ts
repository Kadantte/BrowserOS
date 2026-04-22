/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { existsSync } from 'node:fs'
import { buildCommandError, PodmanTransportError } from './podman-errors'
import { readTextStream } from './podman-streams'
import type {
  LogFn,
  PodmanContainerCreateInput,
  PodmanContainerSummary,
  PodmanExecInput,
  PodmanExecResult,
  PodmanTransport,
} from './podman-transport'

type BunSpawn = typeof Bun.spawn
type SpawnOptions = Exclude<Parameters<BunSpawn>[1], undefined>
type SpawnResult = ReturnType<BunSpawn>
type SpawnReadable = ReadableStream<Uint8Array<ArrayBufferLike>> | null

interface PodmanShellDeps {
  spawn?: BunSpawn
}

interface ShellCommandResult {
  exitCode: number
  stderr: string
  stdout: string
}

export interface PodmanShellConfig {
  limactlPath?: string
  vmName: string
}

export class PodmanShell implements PodmanTransport {
  private readonly limactlPath: string
  private readonly spawn: BunSpawn
  private readonly vmName: string

  constructor(config: PodmanShellConfig, deps?: PodmanShellDeps) {
    this.limactlPath = config.limactlPath ?? 'limactl'
    this.spawn = deps?.spawn ?? Bun.spawn
    this.vmName = config.vmName
  }

  async imageExists(image: string): Promise<boolean> {
    const result = await this.runPodmanCommand(['image', 'exists', image])
    if (result.exitCode === 0) return true
    if (result.exitCode === 1 && !result.stderr.trim()) return false
    throw this.buildShellError(['image', 'exists', image], result)
  }

  async pullImage(image: string, onLog?: LogFn): Promise<void> {
    const result = await this.runPodmanCommand(['pull', image], {
      onOutput: onLog,
    })
    if (result.exitCode === 0) return
    throw this.buildShellError(['pull', image], result)
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

    const result = await this.runPodmanCommand(['load'], {
      onOutput: onLog,
      stdin: Bun.file(input.archivePath),
    })
    if (result.exitCode === 0) return
    throw this.buildShellError(['load'], result)
  }

  async createContainer(
    input: PodmanContainerCreateInput,
  ): Promise<{ id: string }> {
    const args = buildPodmanCreateArgs(input)
    const result = await this.runPodmanCommand(args)
    if (result.exitCode !== 0) throw this.buildShellError(args, result)

    const id = result.stdout.trim()
    if (!id) {
      throw new PodmanTransportError(
        `Podman create returned no container ID for ${input.name}`,
        'command_failed',
        false,
        {
          command: buildPodmanShellCommand(this.limactlPath, this.vmName, args),
          stdout: result.stdout,
        },
      )
    }

    return { id }
  }

  async startContainer(name: string): Promise<void> {
    await this.runRequired(['start', name])
  }

  async stopContainer(
    name: string,
    options?: { ignore?: boolean; timeoutSeconds?: number },
  ): Promise<void> {
    const args = ['stop']
    if (options?.ignore) args.push('--ignore')
    if (options?.timeoutSeconds !== undefined) {
      args.push('--time', String(options.timeoutSeconds))
    }
    args.push(name)
    await this.runRequired(args)
  }

  async removeContainer(
    name: string,
    options?: { force?: boolean; ignore?: boolean },
  ): Promise<void> {
    const args = ['rm']
    if (options?.force) args.push('--force')
    if (options?.ignore) args.push('--ignore')
    args.push(name)
    await this.runRequired(args)
  }

  async inspectContainer(name: string): Promise<unknown> {
    const result = await this.runPodmanCommand([
      'inspect',
      '--format',
      'json',
      name,
    ])
    if (result.exitCode !== 0) {
      throw this.buildShellError(['inspect', '--format', 'json', name], result)
    }

    const parsed = JSON.parse(result.stdout) as unknown
    if (Array.isArray(parsed)) return parsed[0] ?? null
    return parsed
  }

  async listContainers(options?: {
    all?: boolean
  }): Promise<PodmanContainerSummary[]> {
    const args = ['ps']
    if (options?.all) args.push('--all')
    args.push('--format', 'json')

    const result = await this.runPodmanCommand(args)
    if (result.exitCode !== 0) throw this.buildShellError(args, result)

    return parseContainerList(result.stdout)
  }

  async getLogs(name: string, options?: { tail?: number }): Promise<string[]> {
    const lines: string[] = []
    const args = ['logs']
    if (options?.tail !== undefined) {
      args.push('--tail', String(options.tail))
    }
    args.push(name)

    const result = await this.runPodmanCommand(args, {
      onOutput: (line) => lines.push(line),
    })
    if (result.exitCode !== 0) throw this.buildShellError(args, result)
    return lines
  }

  async tailLogs(name: string, onLog: LogFn): Promise<() => void> {
    const process = this.spawnPodmanCommand(
      ['logs', '-f', '--tail', '0', name],
      {
        stderr: 'pipe',
        stdout: 'pipe',
      },
    )

    void Promise.all([
      readTextStream(getSpawnStream(process.stdout), onLog),
      readTextStream(getSpawnStream(process.stderr), onLog),
    ])

    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      process.kill()
    }
  }

  async exec(
    name: string,
    input: PodmanExecInput,
    onLog?: LogFn,
  ): Promise<PodmanExecResult> {
    const args = buildPodmanExecArgs(name, input)
    const process = this.spawnPodmanCommand(args, {
      stderr: 'pipe',
      stdout: 'pipe',
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      readTextStream(getSpawnStream(process.stdout), onLog),
      readTextStream(getSpawnStream(process.stderr), onLog),
      process.exited,
    ])

    return { exitCode, stdout, stderr }
  }

  private async runRequired(args: string[]): Promise<void> {
    const result = await this.runPodmanCommand(args)
    if (result.exitCode === 0) return
    throw this.buildShellError(args, result)
  }

  private async runPodmanCommand(
    args: string[],
    options?: { onOutput?: LogFn; stdin?: SpawnOptions['stdin'] },
  ): Promise<ShellCommandResult> {
    const process = this.spawnPodmanCommand(args, {
      stderr: 'pipe',
      stdin: options?.stdin,
      stdout: 'pipe',
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      readTextStream(getSpawnStream(process.stdout), options?.onOutput),
      readTextStream(getSpawnStream(process.stderr), options?.onOutput),
      process.exited,
    ])

    return { exitCode, stderr, stdout }
  }

  private spawnPodmanCommand(
    args: string[],
    options: Partial<SpawnOptions>,
  ): SpawnResult {
    return this.spawn(
      buildPodmanShellCommand(this.limactlPath, this.vmName, args),
      {
        stderr: options.stderr ?? 'ignore',
        stdin: options.stdin,
        stdout: options.stdout ?? 'ignore',
      },
    )
  }

  private buildShellError(
    args: string[],
    result: ShellCommandResult,
  ): PodmanTransportError {
    return buildCommandError({
      command: buildPodmanShellCommand(this.limactlPath, this.vmName, args),
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    })
  }
}

export function buildPodmanShellCommand(
  limactlPath: string,
  vmName: string,
  args: string[],
): string[] {
  return [limactlPath, 'shell', '--tty=false', vmName, '--', 'podman', ...args]
}

export function buildPodmanCreateArgs(
  input: PodmanContainerCreateInput,
): string[] {
  const args = ['create', '--name', input.name]

  if (input.restartPolicy) {
    args.push('--restart', input.restartPolicy)
  }
  if (input.envFilePath) {
    args.push('--env-file', input.envFilePath)
  }

  for (const [key, value] of Object.entries(input.env ?? {})) {
    args.push('-e', `${key}=${value}`)
  }
  for (const mount of input.mounts ?? []) {
    args.push('-v', buildMountArg(mount))
  }
  for (const portMapping of input.portMappings ?? []) {
    args.push('-p', buildPortMappingArg(portMapping))
  }
  for (const host of input.addHosts ?? []) {
    args.push('--add-host', host)
  }
  if (input.healthcheck) {
    args.push('--health-cmd', JSON.stringify(input.healthcheck.test))
    if (input.healthcheck.interval) {
      args.push('--health-interval', input.healthcheck.interval)
    }
    if (input.healthcheck.timeout) {
      args.push('--health-timeout', input.healthcheck.timeout)
    }
    if (input.healthcheck.retries !== undefined) {
      args.push('--health-retries', String(input.healthcheck.retries))
    }
  }

  args.push(input.image)
  args.push(...(input.command ?? []))
  return args
}

export function buildPodmanExecArgs(
  name: string,
  input: PodmanExecInput,
): string[] {
  const args = ['exec']

  if (input.workingDir) {
    args.push('--workdir', input.workingDir)
  }
  for (const [key, value] of Object.entries(input.env ?? {})) {
    args.push('--env', `${key}=${value}`)
  }

  args.push(name)
  args.push(...input.command)
  return args
}

function buildMountArg(input: {
  source: string
  target: string
  readOnly?: boolean
}): string {
  const suffix = input.readOnly ? ':ro' : ''
  return `${input.source}:${input.target}${suffix}`
}

function buildPortMappingArg(input: {
  hostIp?: string
  hostPort: number
  containerPort: number
  protocol?: string
}): string {
  const prefix = input.hostIp
    ? `${input.hostIp}:${input.hostPort}`
    : `${input.hostPort}`
  const protocol = input.protocol ? `/${input.protocol}` : ''
  return `${prefix}:${input.containerPort}${protocol}`
}

function parseContainerList(output: string): PodmanContainerSummary[] {
  const parsed = JSON.parse(output) as Array<Record<string, unknown>>

  return parsed.map((entry) => ({
    id: readString(entry.Id, entry.ID, entry.id),
    image: readString(entry.Image, entry.image, entry.ImageID),
    name: readName(entry.Names, entry.Name, entry.name),
    state: readString(entry.State, entry.state, entry.Status),
    status: readOptionalString(entry.Status, entry.status),
  }))
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

function getSpawnStream(
  stream: SpawnResult['stdout'] | SpawnResult['stderr'],
): SpawnReadable {
  return stream instanceof ReadableStream ? stream : null
}
