/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { OpenClawAgentRecord } from './openclaw-cli-client'

export interface OpenClawSessionSummary {
  key: string
  agentId?: string
  model?: string
  kind?: string
  updatedAt?: number
  messageCount?: number
  [extra: string]: unknown
}

export interface OpenClawListSessionsInput {
  limit?: number
  activeMinutes?: number
  kinds?: string[]
  signal?: AbortSignal
}

type RawAgentRow = {
  id: string
  name?: string
  workspace?: string
  model?: string
}

type AgentsListResult = RawAgentRow[] | { agents?: RawAgentRow[] }

type ToolResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error?: { message?: string } }

export class OpenClawHttpClient {
  constructor(private readonly hostPort: number) {}

  async probe(signal?: AbortSignal): Promise<void> {
    const response = await this.request('/v1/models', {
      method: 'GET',
      signal,
    })
    if (!response.ok) {
      throw await toError(response, 'OpenClaw probe failed')
    }
  }

  async listAgents(signal?: AbortSignal): Promise<OpenClawAgentRecord[]> {
    const result = await this.invokeTool<AgentsListResult>(
      'agents_list',
      {},
      signal,
    )
    const rows = Array.isArray(result) ? result : (result.agents ?? [])
    return rows.map((row) => ({
      agentId: row.id,
      name: row.name ?? row.id,
      workspace: row.workspace ?? '',
      model: row.model,
    }))
  }

  async listSessions(
    input: OpenClawListSessionsInput = {},
  ): Promise<OpenClawSessionSummary[]> {
    const args: Record<string, unknown> = {}
    if (input.limit !== undefined) {
      args.limit = input.limit
    }
    if (input.activeMinutes !== undefined) {
      args.activeMinutes = input.activeMinutes
    }
    if (input.kinds !== undefined) {
      args.kinds = input.kinds
    }

    return this.invokeTool<OpenClawSessionSummary[]>(
      'sessions_list',
      args,
      input.signal,
    )
  }

  protected request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`http://127.0.0.1:${this.hostPort}${path}`, init)
  }

  private async invokeTool<T>(
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.request('/tools/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
      signal,
    })

    if (!response.ok) {
      throw await toError(response, `OpenClaw tool '${tool}' failed`)
    }

    const body = (await response.json()) as ToolResponse<T>
    if (!body.ok) {
      throw new Error(body.error?.message ?? `OpenClaw tool '${tool}' failed`)
    }

    return body.result
  }
}

async function toError(response: Response, fallback: string): Promise<Error> {
  const detail = await response.text().catch(() => '')
  return new Error(detail || `${fallback} (HTTP ${response.status})`)
}
