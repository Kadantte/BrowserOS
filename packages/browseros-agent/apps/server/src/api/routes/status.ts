/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'
import type { Browser } from '../../browser/browser'

interface StatusDeps {
  browser: Browser
}

export function createStatusRoute(deps: StatusDeps) {
  const { browser } = deps

  return new Hono().get('/', (c) =>
    c.json({
      status: 'ok',
      cdpConnected: browser.isCdpConnected(),
    }),
  )
}
