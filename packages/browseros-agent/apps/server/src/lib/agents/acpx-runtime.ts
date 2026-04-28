/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { join } from 'node:path'
import {
  type AcpRuntimeEvent,
  type AcpRuntimeHandle,
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
  AgentPromptInput,
  AgentRuntime,
  AgentSession,
  AgentStatus,
  AgentStreamEvent,
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

  async listSessions(
    input: AgentPromptInput['agent'],
  ): Promise<AgentSession[]> {
    return [{ agentId: input.id, id: 'main', updatedAt: input.updatedAt }]
  }

  async getHistory(input: {
    agent: AgentPromptInput['agent']
    sessionId: 'main'
  }): Promise<AgentHistoryPage> {
    return { agentId: input.agent.id, sessionId: input.sessionId, items: [] }
  }

  async send(
    input: AgentPromptInput,
  ): Promise<ReadableStream<AgentStreamEvent>> {
    const runtime = this.getRuntime({
      cwd: this.cwd,
      permissionMode: input.permissionMode,
      nonInteractivePermissions: 'fail',
      timeoutMs: input.timeoutMs,
    })

    return createAcpxEventStream(runtime, input, this.cwd)
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
  input: AgentPromptInput,
  cwd: string,
): ReadableStream<AgentStreamEvent> {
  let activeTurn: AcpRuntimeTurn | null = null

  return new ReadableStream<AgentStreamEvent>({
    start(controller) {
      const run = async () => {
        const handle = await runtime.ensureSession({
          sessionKey: input.sessionKey,
          agent: input.agent.adapter,
          mode: 'persistent',
          cwd,
        })

        for (const event of await applyRuntimeControls(
          runtime,
          handle,
          input,
        )) {
          controller.enqueue(event)
        }

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

async function applyRuntimeControls(
  runtime: AcpxCoreRuntime,
  handle: AcpRuntimeHandle,
  input: AgentPromptInput,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = []
  if (input.agent.modelId && input.agent.modelId !== 'default') {
    events.push({
      type: 'status',
      text: 'Requested model is stored on the BrowserOS agent, but this acpx/runtime version does not expose public model control. Using adapter default.',
    })
  }
  if (!input.agent.reasoningEffort) return events

  const key = input.agent.adapter === 'codex' ? 'reasoning_effort' : 'effort'
  if (!runtime.setConfigOption) {
    events.push({
      type: 'status',
      text: `Requested ${key}=${input.agent.reasoningEffort}, but this acpx/runtime version does not expose config control.`,
    })
    return events
  }

  try {
    await runtime.setConfigOption({
      handle,
      key,
      value: input.agent.reasoningEffort,
    })
  } catch (err) {
    throw new Error(
      `Failed to set ${key}=${input.agent.reasoningEffort}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
  return events
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
