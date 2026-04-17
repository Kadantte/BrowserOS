/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { OPENCLAW_CONTAINER_HOME } from '@browseros/shared/constants/openclaw'

type LogFn = (line: string) => void

interface ContainerExecutor {
  execInContainer(command: string[], onLog?: LogFn): Promise<number>
}

interface RawAgentRecord {
  id: string
  name?: string
  workspace: string
  model?: string
}

export interface OpenClawAgentRecord {
  agentId: string
  name: string
  workspace: string
  model?: string
}

export class OpenClawCliClient {
  constructor(private readonly executor: ContainerExecutor) {}

  async runOnboard(
    input: {
      workspace?: string
      reset?: boolean
      resetScope?: 'config' | 'config+creds+sessions' | 'full'
      nonInteractive?: boolean
      mode?: 'local' | 'remote'
    } = {},
  ): Promise<void> {
    const args = ['onboard']

    if (input.workspace) {
      args.push('--workspace', input.workspace)
    }
    if (input.reset) {
      args.push('--reset')
    }
    if (input.resetScope) {
      args.push('--reset-scope', input.resetScope)
    }
    if (input.nonInteractive) {
      args.push('--non-interactive')
    }
    if (input.mode) {
      args.push('--mode', input.mode)
    }

    await this.runCommand(args)
  }

  async setConfig(path: string, value: unknown): Promise<void> {
    await this.runCommand(['config', 'set', path, formatConfigValue(value)])
  }

  async getConfig(path: string): Promise<unknown> {
    const output = await this.runCommand(['config', 'get', path])
    return parseConfigValue(output)
  }

  async validateConfig(): Promise<unknown> {
    const output = await this.runCommand(['config', 'validate', '--json'])
    return parseJsonOutput<unknown>(output)
  }

  async setDefaultModel(model: string): Promise<void> {
    await this.runCommand(['models', 'set', model])
  }

  async listAgents(): Promise<OpenClawAgentRecord[]> {
    const records = await this.runJsonCommand<
      RawAgentRecord[] | { agents?: RawAgentRecord[] }
    >(['agents', 'list', '--json'])
    const agents = Array.isArray(records) ? records : (records.agents ?? [])
    return agents.map((record) => ({
      agentId: record.id,
      name: record.name ?? record.id,
      workspace: record.workspace,
      model: record.model,
    }))
  }

  async createAgent(input: {
    name: string
    workspace?: string
    model?: string
  }): Promise<OpenClawAgentRecord> {
    const workspace = this.agentWorkspace(input.name)
    const args = ['agents', 'add', input.name, '--workspace', workspace]

    if (input.model) {
      args.push('--model', input.model)
    }

    args.push('--non-interactive', '--json')
    await this.runCommand(args)

    const agents = await this.listAgents()
    const agent = agents.find((entry) => entry.agentId === input.name)
    if (!agent) {
      throw new Error(`Created agent ${input.name} was not found in agent list`)
    }

    return agent
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.runCommand(['agents', 'delete', agentId, '--force', '--json'])
  }

  async probe(): Promise<void> {
    await this.listAgents()
  }

  private agentWorkspace(name: string): string {
    return name === 'main'
      ? `${OPENCLAW_CONTAINER_HOME}/workspace`
      : `${OPENCLAW_CONTAINER_HOME}/workspace-${name}`
  }

  private async runJsonCommand<T>(args: string[]): Promise<T> {
    const output = await this.runCommand(args)
    return parseJsonOutput<T>(output)
  }

  private async runCommand(args: string[]): Promise<string> {
    const output: string[] = []
    const command = ['node', 'dist/index.js', ...args]
    const exitCode = await this.executor.execInContainer(command, (line) => {
      output.push(line)
    })

    if (exitCode !== 0) {
      const detail = output.join('\n').trim()
      throw new Error(
        detail || `OpenClaw command failed (${args.slice(0, 2).join(' ')})`,
      )
    }

    return output.join('\n').trim()
  }
}

function formatConfigValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function parseConfigValue(output: string): unknown {
  const parsed = tryParseJson(output)
  return parsed ?? output
}

function parseJsonOutput<T>(output: string): T {
  const direct = tryParseJson<T>(output)
  if (direct !== null) return direct

  for (const line of output.split(/\r?\n/)) {
    const parsed = tryParseJson<T>(line)
    if (parsed !== null) return parsed
  }

  for (let index = 0; index < output.length; index += 1) {
    const char = output[index]
    if (char !== '[' && char !== '{') continue
    const extracted = extractJsonSubstring(output, index)
    if (!extracted) continue
    const parsed = tryParseJson<T>(extracted)
    if (parsed !== null) return parsed
  }

  throw new Error(
    `Failed to parse OpenClaw JSON output: ${output.slice(0, 200)}`,
  )
}

function extractJsonSubstring(
  output: string,
  startIndex: number,
): string | null {
  const opening = output[startIndex]
  const closing = opening === '{' ? '}' : ']'
  const stack: string[] = [closing]
  let inString = false
  let escaped = false

  for (let index = startIndex + 1; index < output.length; index += 1) {
    const char = output[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      stack.push('}')
      continue
    }

    if (char === '[') {
      stack.push(']')
      continue
    }

    const expectedClosing = stack[stack.length - 1]
    if (char === expectedClosing) {
      stack.pop()
      if (stack.length === 0) {
        return output.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

function tryParseJson<T>(value: string): T | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}
