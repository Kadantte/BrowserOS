/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, it } from 'bun:test'
import assert from 'node:assert'

import { createHealthRoute } from '../../../src/api/routes/health'

describe('createHealthRoute', () => {
  it('returns status ok with connected CDP state', async () => {
    const route = createHealthRoute({
      browser: { isCdpConnected: () => true } as never,
    })
    const response = await route.request('/')

    assert.strictEqual(response.status, 200)
    const body = await response.json()
    assert.deepStrictEqual(body, { status: 'ok', cdpConnected: true })
  })

  it('returns disconnected CDP state when browser is disconnected', async () => {
    const route = createHealthRoute({
      browser: { isCdpConnected: () => false } as never,
    })
    const response = await route.request('/')

    assert.strictEqual(response.status, 200)
    const body = await response.json()
    assert.deepStrictEqual(body, { status: 'ok', cdpConnected: false })
  })
})
