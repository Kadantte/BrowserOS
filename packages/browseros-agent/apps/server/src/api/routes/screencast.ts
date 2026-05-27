/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import type { Browser } from '../../browser/browser'
import { logger } from '../../lib/logger'
import { ScreencastManager } from '../services/screencast/screencast-manager'

interface ScreencastRouteDeps {
  browser: Browser
}

function parseWindowId(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function createScreencastRoute(deps: ScreencastRouteDeps) {
  const manager = new ScreencastManager(deps.browser)

  return new Hono().get(
    '/',
    upgradeWebSocket((c) => {
      const windowId = parseWindowId(c.req.query('windowId'))
      let attached: number | null = null

      return {
        onOpen: async (_evt, ws) => {
          if (windowId === null) {
            ws.close(1008, 'windowId query param is required')
            return
          }
          try {
            await manager.subscribe(windowId, ws)
            attached = windowId
          } catch (err) {
            logger.warn('screencast subscribe failed', {
              windowId,
              error: err instanceof Error ? err.message : String(err),
            })
            ws.close(
              1011,
              err instanceof Error ? err.message : 'subscribe failed',
            )
          }
        },
        onClose: (_evt, ws) => {
          if (attached !== null) {
            manager.unsubscribe(attached, ws)
            attached = null
          }
        },
        onError: (_evt, ws) => {
          if (attached !== null) {
            manager.unsubscribe(attached, ws)
            attached = null
          }
        },
      }
    }),
  )
}
