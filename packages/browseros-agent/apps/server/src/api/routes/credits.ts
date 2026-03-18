/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { fetchCredits, setCredits } from '../../lib/clients/gateway'
import { logger } from '../../lib/logger'

interface CreditsDeps {
  browserosId?: string
  gatewayBaseUrl?: string
}

const SetCreditsSchema = z.object({
  credits: z.number().int().nonnegative(),
})

export function createCreditsRoutes(deps: CreditsDeps) {
  const { browserosId, gatewayBaseUrl } = deps

  if (!browserosId || !gatewayBaseUrl) {
    return new Hono().all('/*', (c) =>
      c.json({ error: 'Credits not configured' }, 503),
    )
  }

  return new Hono()
    .get('/', async (c) => {
      try {
        const credits = await fetchCredits(gatewayBaseUrl, browserosId)
        return c.json(credits)
      } catch (error) {
        logger.error('Failed to fetch credits', {
          error: error instanceof Error ? error.message : String(error),
        })
        return c.json({ error: 'Failed to fetch credits' }, 502)
      }
    })
    .put('/', zValidator('json', SetCreditsSchema), async (c) => {
      try {
        const { credits } = c.req.valid('json')
        const result = await setCredits(gatewayBaseUrl, browserosId, credits)
        return c.json(result)
      } catch (error) {
        logger.error('Failed to set credits', {
          error: error instanceof Error ? error.message : String(error),
        })
        return c.json({ error: 'Failed to set credits' }, 502)
      }
    })
}
