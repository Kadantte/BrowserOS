/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it, mock } from 'bun:test'
import {
  handleTerminalWebSocketRequest,
  TERMINAL_WS_PATH,
} from '../../../src/api/routes/terminal'

describe('handleTerminalWebSocketRequest', () => {
  it('ignores non-terminal paths', () => {
    const upgrade = mock(() => true)
    const response = handleTerminalWebSocketRequest(
      new Request('http://localhost/health'),
      { upgrade },
    )

    expect(response).toBeNull()
    expect(upgrade).not.toHaveBeenCalled()
  })

  it('requires a websocket upgrade header for the terminal path', async () => {
    const upgrade = mock(() => true)
    const response = handleTerminalWebSocketRequest(
      new Request(`http://localhost${TERMINAL_WS_PATH}?agentId=sammy`),
      { upgrade },
    )

    expect(response?.status).toBe(426)
    expect(await response?.text()).toBe('WebSocket upgrade required')
    expect(upgrade).not.toHaveBeenCalled()
  })

  it('upgrades the terminal websocket with the requested agent id', () => {
    const upgrade = mock(() => true)
    const request = new Request(
      `http://localhost${TERMINAL_WS_PATH}?agentId=sammy`,
      {
        headers: { Upgrade: 'websocket' },
      },
    )

    const response = handleTerminalWebSocketRequest(request, { upgrade })

    expect(response).toBeUndefined()
    expect(upgrade).toHaveBeenCalledWith(request, {
      data: { agentId: 'sammy' },
    })
  })

  it('defaults to the main agent when agentId is omitted', () => {
    const upgrade = mock(() => true)
    const request = new Request(`http://localhost${TERMINAL_WS_PATH}`, {
      headers: { Upgrade: 'websocket' },
    })

    handleTerminalWebSocketRequest(request, { upgrade })

    expect(upgrade).toHaveBeenCalledWith(request, {
      data: { agentId: 'main' },
    })
  })

  it('returns 426 when bun rejects the upgrade', async () => {
    const response = handleTerminalWebSocketRequest(
      new Request(`http://localhost${TERMINAL_WS_PATH}`, {
        headers: { Upgrade: 'websocket' },
      }),
      { upgrade: mock(() => false) },
    )

    expect(response?.status).toBe(426)
    expect(await response?.text()).toBe('WebSocket upgrade failed')
  })
})
