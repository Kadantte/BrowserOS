/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `/acp/*` HTTP routes — currently only the agent-detection endpoint
 * used by the LLM provider settings UI.
 */

import { Hono } from 'hono'
import {
  type AcpAgentDetection,
  detectAcpAgents,
} from '../../lib/clients/acp/detect-agents'
import { logger } from '../../lib/logger'

const CACHE_TTL_MS = 30_000

interface CacheEntry {
  expiresAt: number
  agents: AcpAgentDetection[]
}

let cache: CacheEntry | null = null

export function createAcpRoutes() {
  return new Hono().post('/detect', async (c) => {
    const fresh = c.req.query('fresh') === '1'
    const now = Date.now()

    if (!fresh && cache && cache.expiresAt > now) {
      return c.json({ agents: cache.agents, cached: true })
    }

    try {
      const agents = await detectAcpAgents()
      cache = { expiresAt: now + CACHE_TTL_MS, agents }
      return c.json({ agents, cached: false })
    } catch (err) {
      logger.error('ACP agent detection failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return c.json(
        {
          agents: [] as AcpAgentDetection[],
          cached: false,
          error:
            err instanceof Error ? err.message : 'Unknown detection failure',
        },
        500,
      )
    }
  })
}

/** For tests — drop the in-memory cache between cases. */
export function _resetAcpDetectCache(): void {
  cache = null
}
