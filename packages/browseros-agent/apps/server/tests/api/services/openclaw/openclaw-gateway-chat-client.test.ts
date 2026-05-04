/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { OpenClawGatewayChatClient } from '../../../../src/api/services/openclaw/openclaw-gateway-chat-client'

describe('OpenClawGatewayChatClient', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('posts chat completions without Authorization when no token provider is configured', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(emptyStream(), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof globalThis.fetch
    const client = new OpenClawGatewayChatClient(() => 18794)

    await client.streamTurn({
      agentId: 'main',
      sessionKey: 'main',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:18794/v1/chat/completions',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(fetchHeaders(fetchMock)).not.toHaveProperty('Authorization')
  })
})

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

function fetchHeaders(
  fetchMock: ReturnType<typeof mock>,
): Record<string, string> {
  return ((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers ??
    {}) as Record<string, string>
}
