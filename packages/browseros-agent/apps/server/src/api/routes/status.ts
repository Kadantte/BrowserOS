/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'
import type { Browser } from '../../browser/browser'

interface StatusDeps {
  browser?: Browser
}

export function createStatusRoute(deps: StatusDeps = {}) {
  const cdpConnected = deps.browser?.isCdpConnected()

  return new Hono().get('/', (c) =>
    c.json(
      cdpConnected === undefined
        ? { status: 'ok' }
        : { status: 'ok', cdpConnected },
    ),
  )
}
