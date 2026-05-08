/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { z } from 'zod'
import {
  type AgentRuntime,
  ContainerAgentRuntime,
  getAgentRuntimeRegistry,
  type RuntimeAction,
  type RuntimeCapability,
} from '../../lib/agents/runtime'
import { logger } from '../../lib/logger'

const RUNTIME_ACTION_NAMES = [
  'install',
  'start',
  'stop',
  'restart',
  'reset-soft',
  'reset-wipe-agent',
  'reset-hard',
  'reinstall-cli',
  'check-auth',
] as const satisfies ReadonlyArray<RuntimeAction['type']>

const AdapterParamSchema = z.object({
  adapter: z.string().min(1),
})

const ActionParamSchema = z.object({
  adapter: z.string().min(1),
  action: z.enum(RUNTIME_ACTION_NAMES),
})

const ActionBodySchema = z.object({
  agentId: z.string().min(1).optional(),
})

const LogsQuerySchema = z.object({
  tail: z.coerce.number().int().min(1).max(2_000).optional(),
})

function buildRuntimeView(runtime: AgentRuntime) {
  return {
    descriptor: runtime.descriptor,
    status: runtime.getStatusSnapshot(),
    capabilities: runtime.getCapabilities(),
  }
}

export function createRuntimeRoutes() {
  return new Hono()
    .get('/', (c) => {
      const runtimes = getAgentRuntimeRegistry().list().map(buildRuntimeView)
      return c.json({ runtimes })
    })
    .get('/:adapter/status', zValidator('param', AdapterParamSchema), (c) => {
      const { adapter } = c.req.valid('param')
      const runtime = getAgentRuntimeRegistry().get(adapter)
      if (!runtime) return c.json({ error: 'runtime not registered' }, 404)
      return c.json(buildRuntimeView(runtime))
    })
    .get(
      '/:adapter/status/stream',
      zValidator('param', AdapterParamSchema),
      (c) => {
        const { adapter } = c.req.valid('param')
        const runtime = getAgentRuntimeRegistry().get(adapter)
        if (!runtime) return c.json({ error: 'runtime not registered' }, 404)
        c.header('Content-Type', 'text/event-stream')
        c.header('Cache-Control', 'no-cache')
        c.header('Connection', 'keep-alive')
        return stream(c, async (s) => {
          const encoder = new TextEncoder()
          const writeSnapshot = (snap: unknown) =>
            s
              .write(
                encoder.encode(
                  `event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`,
                ),
              )
              .catch(() => {})
          await writeSnapshot(runtime.getStatusSnapshot())
          const unsubscribe = runtime.subscribe(writeSnapshot)
          const heartbeat = setInterval(() => {
            s.write(
              encoder.encode(
                `event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`,
              ),
            ).catch(() => {})
          }, 15_000)
          try {
            await new Promise<void>((resolve) => s.onAbort(() => resolve()))
          } finally {
            unsubscribe()
            clearInterval(heartbeat)
          }
        })
      },
    )
    .post(
      '/:adapter/actions/:action',
      zValidator('param', ActionParamSchema),
      zValidator('json', ActionBodySchema),
      async (c) => {
        const { adapter, action } = c.req.valid('param')
        const body = c.req.valid('json')
        const runtime = getAgentRuntimeRegistry().get(adapter)
        if (!runtime) return c.json({ error: 'runtime not registered' }, 404)
        if (!runtime.getCapabilities().includes(action as RuntimeCapability))
          return c.json({ error: 'action not supported' }, 405)
        try {
          if (action === 'reset-wipe-agent') {
            if (!body.agentId)
              return c.json(
                { error: 'agentId required for reset-wipe-agent' },
                400,
              )
            await runtime.executeAction({
              type: 'reset-wipe-agent',
              agentId: body.agentId,
            })
          } else {
            await runtime.executeAction({ type: action })
          }
          return c.json({
            status: 'ok' as const,
            state: runtime.getStatusSnapshot().state,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn('Runtime action failed', {
            adapter,
            action,
            error: message,
          })
          return c.json({ error: message }, 500)
        }
      },
    )
    .get(
      '/:adapter/logs',
      zValidator('param', AdapterParamSchema),
      zValidator('query', LogsQuerySchema),
      async (c) => {
        const { adapter } = c.req.valid('param')
        const { tail } = c.req.valid('query')
        const runtime = getAgentRuntimeRegistry().get(adapter)
        if (!runtime) return c.json({ error: 'runtime not registered' }, 404)
        if (!(runtime instanceof ContainerAgentRuntime))
          return c.json({ error: 'logs not supported' }, 405)
        try {
          const lines = await runtime.getLogs(tail ?? 50)
          return c.json({ lines })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return c.json({ error: message }, 500)
        }
      },
    )
}
