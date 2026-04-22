/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type LogFn = (line: string) => void

export interface PodmanHealthcheck {
  test: string[]
  interval?: string
  timeout?: string
  retries?: number
}

export interface PodmanMount {
  source: string
  target: string
  readOnly?: boolean
}

export interface PodmanPortMapping {
  hostIp?: string
  hostPort: number
  containerPort: number
  protocol?: 'tcp' | 'udp' | 'sctp'
}

export interface PodmanContainerCreateInput {
  name: string
  image: string
  command?: string[]
  env?: Record<string, string>
  envFilePath?: string
  mounts?: PodmanMount[]
  portMappings?: PodmanPortMapping[]
  restartPolicy?: 'no' | 'unless-stopped' | 'on-failure' | 'always'
  addHosts?: string[]
  healthcheck?: PodmanHealthcheck
}

export interface PodmanExecInput {
  command: string[]
  workingDir?: string
  env?: Record<string, string>
}

export interface PodmanExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface PodmanContainerSummary {
  id: string
  name: string
  image: string
  state: string
  status?: string
}

export interface PodmanTransport {
  imageExists(image: string): Promise<boolean>
  pullImage(image: string, onLog?: LogFn): Promise<void>
  loadImage(input: { archivePath: string }, onLog?: LogFn): Promise<void>
  createContainer(input: PodmanContainerCreateInput): Promise<{ id: string }>
  startContainer(name: string): Promise<void>
  stopContainer(
    name: string,
    options?: { ignore?: boolean; timeoutSeconds?: number },
  ): Promise<void>
  removeContainer(
    name: string,
    options?: { force?: boolean; ignore?: boolean },
  ): Promise<void>
  inspectContainer(name: string): Promise<unknown>
  listContainers(options?: { all?: boolean }): Promise<PodmanContainerSummary[]>
  getLogs(name: string, options?: { tail?: number }): Promise<string[]>
  tailLogs(name: string, onLog: LogFn): Promise<() => void>
  exec(
    name: string,
    input: PodmanExecInput,
    onLog?: LogFn,
  ): Promise<PodmanExecResult>
}
