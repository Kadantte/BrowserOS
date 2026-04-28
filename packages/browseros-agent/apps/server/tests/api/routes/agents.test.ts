/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import { createAgentRoutes } from '../../../src/api/routes/agents'
import type {
  AgentHistoryStore,
  AgentRuntime,
  AgentStreamEvent,
} from '../../../src/lib/agents/types'

describe('createAgentRoutes', () => {
  it('streams chat events as BrowserOS SSE and records history', async () => {
    const history: Array<{
      profileId: string
      sessionKey: string
      role: 'user' | 'assistant'
      content: string
    }> = []
    const runtime: AgentRuntime = {
      async status() {
        return { state: 'ready' }
      },
      async listSessions() {
        return []
      },
      async getHistory({ profileId, sessionKey }) {
        return {
          profileId,
          sessionKey,
          items: history,
        }
      },
      async send() {
        return new ReadableStream<AgentStreamEvent>({
          start(controller) {
            controller.enqueue({
              type: 'text_delta',
              text: 'Hello',
              stream: 'output',
            })
            controller.enqueue({
              type: 'done',
              text: 'Hello',
              stopReason: 'end_turn',
            })
            controller.close()
          },
        })
      },
    }
    const store: AgentHistoryStore = {
      async append(item) {
        history.push(item)
      },
      async list({ profileId, sessionKey }) {
        return history.filter(
          (item) =>
            item.profileId === profileId && item.sessionKey === sessionKey,
        )
      },
      async listSessions() {
        return [
          {
            profileId: 'claude',
            key: 'session-1',
            updatedAt: history[history.length - 1]?.createdAt ?? Date.now(),
          },
        ]
      },
    }
    const route = createAgentRoutes({
      runtime,
      historyStore: store,
      profiles: [
        {
          id: 'claude',
          name: 'Claude Code',
          backend: 'acpx',
          agent: 'claude',
        },
      ],
    })

    const response = await route.request('/claude/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'hi',
        sessionKey: 'session-1',
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(response.headers.get('X-Session-Key')).toBe('session-1')
    expect(await response.text()).toBe(
      'data: {"type":"text_delta","text":"Hello","stream":"output"}\n\n' +
        'data: {"type":"done","text":"Hello","stopReason":"end_turn"}\n\n' +
        'data: [DONE]\n\n',
    )
    expect(history.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello' },
    ])
  })
})
