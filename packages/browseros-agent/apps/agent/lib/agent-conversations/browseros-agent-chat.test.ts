import { describe, expect, it } from 'bun:test'
import type { UIMessageStreamEvent } from '@browseros/shared/schemas/ui-stream'
import {
  buildBrowserOsConversation,
  createBrowserOsAgentStreamState,
  reduceBrowserOsAgentStreamEvent,
} from './browseros-agent-chat'
import type { AgentConversationTurn } from './types'

describe('browseros-agent-chat', () => {
  it('builds user and assistant conversation history from stored turns', () => {
    const turns: AgentConversationTurn[] = [
      {
        id: 'turn-1',
        userText: 'What changed?',
        parts: [
          { kind: 'thinking', text: 'reviewing', done: true },
          { kind: 'text', text: 'We shipped the migration.' },
        ],
        done: true,
        timestamp: 1,
      },
      {
        id: 'turn-2',
        userText: 'Anything else?',
        parts: [{ kind: 'tool-batch', tools: [] }],
        done: true,
        timestamp: 2,
      },
    ]

    expect(buildBrowserOsConversation(turns)).toEqual([
      { role: 'user', text: 'What changed?' },
      { role: 'assistant', text: 'We shipped the migration.' },
      { role: 'user', text: 'Anything else?' },
    ])
  })

  it('reduces generic UI stream events into conversation parts', () => {
    const events: UIMessageStreamEvent[] = [
      { type: 'start' },
      { type: 'reasoning-start', id: 'reasoning-1' },
      { type: 'reasoning-delta', id: 'reasoning-1', delta: 'Thinking...' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello' },
      {
        type: 'tool-input-start',
        toolCallId: 'tool-1',
        toolName: 'search',
      },
      {
        type: 'tool-output-available',
        toolCallId: 'tool-1',
        output: { ok: true },
      },
      { type: 'text-delta', id: 'text-1', delta: ' world' },
      { type: 'reasoning-end', id: 'reasoning-1' },
      { type: 'finish', finishReason: 'stop' },
    ]

    const state = events.reduce(
      (current, event) => reduceBrowserOsAgentStreamEvent(current, event),
      createBrowserOsAgentStreamState(),
    )

    expect(state.done).toBe(true)
    expect(state.parts).toEqual([
      { kind: 'thinking', text: 'Thinking...', done: true },
      {
        kind: 'tool-batch',
        tools: [{ id: 'tool-1', name: 'search', status: 'completed' }],
      },
      { kind: 'text', text: 'Hello world' },
    ])
  })
})
