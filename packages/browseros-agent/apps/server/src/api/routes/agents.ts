/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { type Context, Hono } from 'hono'
import { stream } from 'hono/streaming'
import type {
  AgentHistoryStore,
  AgentNonInteractivePermissionPolicy,
  AgentPermissionMode,
  AgentProfile,
  AgentRuntime,
  AgentStreamEvent,
} from '../../lib/agents/types'
import {
  AgentHarnessService,
  UnknownAgentProfileError,
} from '../services/agents/agent-harness-service'
import type { Env } from '../types'

type AgentRouteDeps = {
  profiles?: AgentProfile[]
  runtime?: AgentRuntime
  historyStore?: AgentHistoryStore
  service?: AgentHarnessService
}

const PERMISSION_MODES = new Set<AgentPermissionMode>([
  'approve-all',
  'approve-reads',
  'deny-all',
])

const NON_INTERACTIVE_PERMISSION_POLICIES =
  new Set<AgentNonInteractivePermissionPolicy>(['deny', 'fail'])

export function createAgentRoutes(deps: AgentRouteDeps = {}) {
  const service =
    deps.service ??
    new AgentHarnessService({
      profiles: deps.profiles,
      runtime: deps.runtime,
      historyStore: deps.historyStore,
    })

  return new Hono<Env>()
    .get('/profiles', (c) => c.json({ profiles: service.listProfiles() }))
    .get('/:profileId/status', async (c) => {
      try {
        return c.json(await service.status(c.req.param('profileId')))
      } catch (err) {
        return handleAgentRouteError(c, err)
      }
    })
    .get('/:profileId/sessions', async (c) => {
      try {
        return c.json({
          sessions: await service.listSessions(c.req.param('profileId')),
        })
      } catch (err) {
        return handleAgentRouteError(c, err)
      }
    })
    .get('/:profileId/sessions/:sessionKey/history', async (c) => {
      try {
        return c.json(
          await service.getHistory({
            profileId: c.req.param('profileId'),
            sessionKey: c.req.param('sessionKey'),
          }),
        )
      } catch (err) {
        return handleAgentRouteError(c, err)
      }
    })
    .post('/:profileId/chat', async (c) => {
      const profileId = c.req.param('profileId')
      if (!service.getProfile(profileId)) {
        return c.json({ error: `Unknown agent profile: ${profileId}` }, 404)
      }

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
      }

      const parsed = parseChatBody(body)
      if ('error' in parsed) {
        return c.json({ error: parsed.error }, 400)
      }

      const sessionKey = parsed.sessionKey ?? crypto.randomUUID()
      await service.historyStore.append({
        profileId,
        sessionKey,
        role: 'user',
        content: parsed.message,
      })

      let eventStream: ReadableStream<AgentStreamEvent>
      try {
        eventStream = await service.send({
          profileId,
          sessionKey,
          message: parsed.message,
          cwd: parsed.cwd,
          permissionMode: parsed.permissionMode,
          nonInteractivePermissions: parsed.nonInteractivePermissions,
          timeoutMs: parsed.timeoutMs,
          signal: c.req.raw.signal,
        })
      } catch (err) {
        return handleAgentRouteError(c, err)
      }

      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('X-Session-Key', sessionKey)

      return stream(c, async (s) => {
        const reader = eventStream.getReader()
        const encoder = new TextEncoder()
        let assistantText = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value.type === 'text_delta' && value.stream === 'output') {
              assistantText += value.text
            }
            if (value.type === 'done' && !assistantText && value.text) {
              assistantText = value.text
            }
            await s.write(encoder.encode(`data: ${JSON.stringify(value)}\n\n`))
          }
          await s.write(encoder.encode('data: [DONE]\n\n'))
        } finally {
          await reader.cancel()
          if (assistantText.trim()) {
            await service.historyStore.append({
              profileId,
              sessionKey,
              role: 'assistant',
              content: assistantText,
            })
          }
        }
      })
    })
}

function parseChatBody(body: unknown):
  | {
      message: string
      sessionKey?: string
      cwd?: string
      permissionMode?: AgentPermissionMode
      nonInteractivePermissions?: AgentNonInteractivePermissionPolicy
      timeoutMs?: number
    }
  | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'JSON object body is required' }
  }
  const record = body as Record<string, unknown>
  const message =
    typeof record.message === 'string' ? record.message.trim() : ''
  if (!message) return { error: 'Message is required' }

  const sessionKey =
    typeof record.sessionKey === 'string' && record.sessionKey.trim()
      ? record.sessionKey.trim()
      : undefined
  const cwd =
    typeof record.cwd === 'string' && record.cwd.trim()
      ? record.cwd.trim()
      : undefined
  const timeoutMs =
    typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs)
      ? record.timeoutMs
      : undefined

  const permissionMode =
    typeof record.permissionMode === 'string' &&
    PERMISSION_MODES.has(record.permissionMode as AgentPermissionMode)
      ? (record.permissionMode as AgentPermissionMode)
      : undefined
  if (record.permissionMode !== undefined && !permissionMode) {
    return { error: 'Invalid permissionMode' }
  }
  const nonInteractivePermissions =
    typeof record.nonInteractivePermissions === 'string' &&
    NON_INTERACTIVE_PERMISSION_POLICIES.has(
      record.nonInteractivePermissions as AgentNonInteractivePermissionPolicy,
    )
      ? (record.nonInteractivePermissions as AgentNonInteractivePermissionPolicy)
      : undefined
  if (
    record.nonInteractivePermissions !== undefined &&
    !nonInteractivePermissions
  ) {
    return { error: 'Invalid nonInteractivePermissions' }
  }

  return {
    message,
    sessionKey,
    cwd,
    permissionMode,
    nonInteractivePermissions,
    timeoutMs,
  }
}

function handleAgentRouteError(c: Context<Env>, err: unknown) {
  if (err instanceof UnknownAgentProfileError) {
    return c.json({ error: err.message }, 404)
  }
  const message = err instanceof Error ? err.message : String(err)
  return c.json({ error: message }, 500)
}
