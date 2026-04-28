/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeOptions,
  AcpRuntime as AcpxCoreRuntime,
} from 'acpx/runtime'
import { AcpxRuntime } from '../../../src/lib/agents/acpx-runtime'
import type { AgentStreamEvent } from '../../../src/lib/agents/types'

describe('AcpxRuntime', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    )
    tempDirs.length = 0
  })

  it('uses acpx/runtime to ensure a session and stream a turn', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'browseros-acpx-runtime-'))
    const stateDir = await mkdtemp(join(tmpdir(), 'browseros-acpx-state-'))
    tempDirs.push(cwd, stateDir)
    const calls: Array<{ method: string; input: unknown }> = []
    const runtimeFactory = (options: AcpRuntimeOptions): AcpxCoreRuntime => {
      calls.push({ method: 'createRuntime', input: options })
      return createFakeAcpRuntime(calls)
    }

    const runtime = new AcpxRuntime({ cwd, stateDir, runtimeFactory })
    const stream = await runtime.send({
      profileId: 'claude',
      profile: {
        id: 'claude',
        name: 'Claude Code',
        backend: 'acpx',
        agent: 'claude',
      },
      sessionKey: 'spike-session',
      message: 'say hello',
    })

    const events = await collectStream(stream)

    expect(calls.map((call) => call.method)).toEqual([
      'createRuntime',
      'ensureSession',
      'startTurn',
    ])
    expect(calls[0]?.input).toMatchObject({
      cwd,
      permissionMode: 'approve-reads',
      nonInteractivePermissions: 'fail',
    })
    expect(calls[1]?.input).toEqual({
      sessionKey: 'spike-session',
      agent: 'claude',
      mode: 'persistent',
      cwd,
    })
    expect(calls[2]?.input).toMatchObject({
      text: 'say hello',
      mode: 'prompt',
    })
    expect(events).toEqual([
      {
        type: 'text_delta',
        text: 'Hello from fake runtime',
        stream: 'output',
        rawType: 'agent_message_chunk',
      },
      {
        type: 'tool_call',
        text: 'Run tests (completed)',
        title: 'Run tests',
        id: 'tool-1',
        status: 'completed',
        rawType: 'tool_call_update',
      },
      {
        type: 'done',
        stopReason: 'end_turn',
      },
    ])
  })
})

function createFakeAcpRuntime(
  calls: Array<{ method: string; input: unknown }>,
): AcpxCoreRuntime {
  return {
    async ensureSession(input) {
      calls.push({ method: 'ensureSession', input })
      return {
        sessionKey: input.sessionKey,
        backend: 'acpx',
        runtimeSessionName: 'encoded-runtime-state',
        cwd: input.cwd,
        acpxRecordId: 'record-1',
      } satisfies AcpRuntimeHandle
    },
    startTurn(input) {
      calls.push({ method: 'startTurn', input })
      return {
        requestId: input.requestId,
        events: iterableEvents([
          {
            type: 'text_delta',
            text: 'Hello from fake runtime',
            stream: 'output',
            tag: 'agent_message_chunk',
          },
          {
            type: 'tool_call',
            text: 'Run tests (completed)',
            title: 'Run tests',
            toolCallId: 'tool-1',
            status: 'completed',
            tag: 'tool_call_update',
          },
        ]),
        result: Promise.resolve({
          status: 'completed',
          stopReason: 'end_turn',
        }),
        async cancel() {},
        async closeStream() {},
      }
    },
    async *runTurn() {},
    async cancel() {},
    async close() {},
  }
}

async function* iterableEvents(events: AcpRuntimeEvent[]) {
  for (const event of events) yield event
}

async function collectStream(
  stream: ReadableStream<AgentStreamEvent>,
): Promise<AgentStreamEvent[]> {
  const reader = stream.getReader()
  const events: AgentStreamEvent[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      events.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return events
}
