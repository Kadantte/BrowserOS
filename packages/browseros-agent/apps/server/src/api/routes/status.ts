/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'

export function createStatusRoute() {
  return new Hono().get('/', (c) =>
    c.json({
      status: 'ok',
    }),
  )
}
