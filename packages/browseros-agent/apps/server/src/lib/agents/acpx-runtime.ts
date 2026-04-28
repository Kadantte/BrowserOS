/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { join } from 'node:path'
import {
  type AcpRuntimeEvent,
  type AcpRuntimeOptions,
  type AcpRuntimeTurn,
  type AcpRuntimeTurnResult,
  type AcpRuntime as AcpxCoreRuntime,
  createAcpRuntime,
  createAgentRegistry,
  createRuntimeStore,
} from 'acpx/runtime'
import { getBrowserosDir } from '../browseros-dir'
import type {
  AgentHistoryPage,
  AgentRuntime,
  AgentSession,
  AgentStatus,
  AgentStreamEvent,
  ResolvedAgentPromptInput,
} from './types'

type AcpxRuntimeOptions = {
  cwd?: string
  stateDir?: string
  runtimeFactory?: (options: AcpRuntimeOptions) => AcpxCoreRuntime
}

export class AcpxRuntime implements AgentRuntime {
  private readonly cwd: string
  private readonly stateDir: string
  private readonly runtimeFactory: (
    options: AcpRuntimeOptions,
  ) => AcpxCoreRuntime
  private readonly runtimes = new Map<string, AcpxCoreRuntime>()

  constructor(options: AcpxRuntimeOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
    this.stateDir =
      options.stateDir ??
      process.env.BROWSEROS_ACPX_STATE_DIR ??
      join(getBrowserosDir(), 'agents', 'acpx')
    this.runtimeFactory = options.runtimeFactory ?? createAcpRuntime
  }

  async status(): Promise<AgentStatus> {
    return { state: 'unknown', message: 'acpx status is checked on send' }
  }

  async listSessions(): Promise<AgentSession[]> {
    return []
  }

  async getHistory(input: {
    profileId: string
    sessionKey: string
  }): Promise<AgentHistoryPage> {
    return { ...input, items: [] }
  }

  async send(
    input: ResolvedAgentPromptInput,
  ): Promise<ReadableStream<AgentStreamEvent>> {
    const cwd = input.cwd ?? input.profile.cwd ?? this.cwd
    const permissionMode =
      input.permissionMode ?? input.profile.permissionMode ?? 'approve-reads'
    const nonInteractivePermissions = input.nonInteractivePermissions ?? 'fail'
    const runtime = this.getRuntime({
      cwd,
      permissionMode,
      nonInteractivePermissions,
      timeoutMs: input.timeoutMs,
    })

    return createAcpxEventStream(runtime, input, cwd)
  }

  private getRuntime(input: {
    cwd: string
    permissionMode: AcpRuntimeOptions['permissionMode']
    nonInteractivePermissions: AcpRuntimeOptions['nonInteractivePermissions']
    timeoutMs?: number
  }): AcpxCoreRuntime {
    const key = JSON.stringify(input)
    const existing = this.runtimes.get(key)
    if (existing) return existing

    const runtime = this.runtimeFactory({
      cwd: input.cwd,
      sessionStore: createRuntimeStore({ stateDir: this.stateDir }),
      agentRegistry: createAgentRegistry(),
      permissionMode: input.permissionMode,
      nonInteractivePermissions: input.nonInteractivePermissions,
      timeoutMs: input.timeoutMs,
    })
    this.runtimes.set(key, runtime)
    return runtime
  }
}

function createAcpxEventStream(
  runtime: AcpxCoreRuntime,
  input: ResolvedAgentPromptInput,
  cwd: string,
): ReadableStream<AgentStreamEvent> {
  let activeTurn: AcpRuntimeTurn | null = null

  return new ReadableStream<AgentStreamEvent>({
    start(controller) {
      const run = async () => {
        const handle = await runtime.ensureSession({
          sessionKey: input.sessionKey,
          agent: input.profile.agent,
          mode: 'persistent',
          cwd,
        })

        const turn = runtime.startTurn({
          handle,
          text: input.message,
          mode: 'prompt',
          requestId: crypto.randomUUID(),
          timeoutMs: input.timeoutMs,
          signal: input.signal,
        })
        activeTurn = turn
        for await (const event of turn.events) {
          controller.enqueue(mapRuntimeEvent(event))
        }
        controller.enqueue(mapTurnResult(await turn.result))
        controller.close()
      }

      void run().catch((err) => {
        controller.enqueue({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
        controller.close()
      })
    },
    cancel() {
      void activeTurn?.cancel({ reason: 'BrowserOS stream cancelled' })
    },
  })
}

function mapRuntimeEvent(event: AcpRuntimeEvent): AgentStreamEvent {
  switch (event.type) {
    case 'text_delta':
      return {
        type: 'text_delta',
        text: event.text,
        stream: event.stream ?? 'output',
        rawType: event.tag,
      }
    case 'tool_call':
      return {
        type: 'tool_call',
        text: event.text,
        title: event.title ?? 'tool call',
        id: event.toolCallId,
        status: event.status,
        rawType: event.tag,
      }
    case 'status':
      return {
        type: 'status',
        text: event.text,
        rawType: event.tag,
      }
    case 'done':
      return {
        type: 'done',
        stopReason: event.stopReason,
      }
    case 'error':
      return {
        type: 'error',
        message: event.message,
        code: event.code,
      }
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}

function mapTurnResult(result: AcpRuntimeTurnResult): AgentStreamEvent {
  switch (result.status) {
    case 'completed':
      return { type: 'done', stopReason: result.stopReason }
    case 'cancelled':
      return { type: 'done', stopReason: result.stopReason ?? 'cancelled' }
    case 'failed':
      return {
        type: 'error',
        message: result.error.message,
        code: result.error.code,
      }
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}
