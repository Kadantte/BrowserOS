/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ProtocolApi } from '@browseros/cdp-protocol/protocol-api'
import { SCREENCAST_LIMITS } from '@browseros/shared/constants/limits'
import type { WSContext } from 'hono/ws'
import type { Browser } from '../../../browser/browser'
import { logger } from '../../../lib/logger'

export interface ScreencastFrameMessage {
  type: 'frame'
  data: string
  metadata: {
    timestamp?: number
    deviceWidth?: number
    deviceHeight?: number
    offsetTop?: number
    pageScaleFactor?: number
    scrollOffsetX?: number
    scrollOffsetY?: number
  }
}

export interface ScreencastStatusMessage {
  type: 'status'
  status: 'connected' | 'detached'
  windowId: number
  url?: string
}

export type ScreencastOutboundMessage =
  | ScreencastFrameMessage
  | ScreencastStatusMessage

type Subscriber = WSContext<unknown>

interface ScreencastSession {
  windowId: number
  targetId: string
  cdpSession: ProtocolApi
  subscribers: Set<Subscriber>
  unsubscribeFrame: () => void
  url: string
}

const WS_OPEN: 1 = 1

export class ScreencastManager {
  private readonly sessions = new Map<number, ScreencastSession>()
  private readonly pendingStarts = new Map<number, Promise<ScreencastSession>>()

  constructor(private readonly browser: Browser) {}

  async subscribe(windowId: number, ws: Subscriber): Promise<void> {
    const session = await this.getOrStartSession(windowId)
    session.subscribers.add(ws)
    this.send(ws, {
      type: 'status',
      status: 'connected',
      windowId,
      url: session.url,
    })
  }

  unsubscribe(windowId: number, ws: Subscriber): void {
    const session = this.sessions.get(windowId)
    if (!session) return
    session.subscribers.delete(ws)
    if (session.subscribers.size === 0) {
      void this.stopSession(windowId).catch((err) => {
        logger.warn('Failed to stop idle screencast session', {
          windowId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    }
  }

  private async getOrStartSession(
    windowId: number,
  ): Promise<ScreencastSession> {
    const existing = this.sessions.get(windowId)
    if (existing) return existing
    const pending = this.pendingStarts.get(windowId)
    if (pending) return pending
    const startPromise = this.startSession(windowId)
    this.pendingStarts.set(windowId, startPromise)
    try {
      const session = await startPromise
      this.sessions.set(windowId, session)
      return session
    } finally {
      this.pendingStarts.delete(windowId)
    }
  }

  private async startSession(windowId: number): Promise<ScreencastSession> {
    const active = await this.browser.getActivePageForWindow(windowId)
    // Page.enable was already called inside Browser.attachToPage; safe to
    // skip here. startScreencast on a session without Page enabled is a
    // silent no-op, hence the ordering matters.
    await active.session.Page.startScreencast({
      format: 'jpeg',
      quality: SCREENCAST_LIMITS.DEFAULT_JPEG_QUALITY,
      everyNthFrame: SCREENCAST_LIMITS.EVERY_NTH_FRAME,
      maxWidth: SCREENCAST_LIMITS.MAX_WIDTH,
      maxHeight: SCREENCAST_LIMITS.MAX_HEIGHT,
    })
    const session: ScreencastSession = {
      windowId,
      targetId: active.targetId,
      cdpSession: active.session,
      subscribers: new Set(),
      url: active.url,
      unsubscribeFrame: () => undefined,
    }
    session.unsubscribeFrame = active.session.Page.on(
      'screencastFrame',
      (params) => {
        this.broadcast(session, {
          type: 'frame',
          data: params.data,
          metadata: {
            timestamp: params.metadata.timestamp,
            deviceWidth: params.metadata.deviceWidth,
            deviceHeight: params.metadata.deviceHeight,
            offsetTop: params.metadata.offsetTop,
            pageScaleFactor: params.metadata.pageScaleFactor,
            scrollOffsetX: params.metadata.scrollOffsetX,
            scrollOffsetY: params.metadata.scrollOffsetY,
          },
        })
        active.session.Page.screencastFrameAck({
          sessionId: params.sessionId,
        }).catch((err) => {
          logger.warn('screencastFrameAck failed', {
            windowId,
            error: err instanceof Error ? err.message : String(err),
          })
        })
      },
    )
    return session
  }

  private async stopSession(windowId: number): Promise<void> {
    const session = this.sessions.get(windowId)
    if (!session) return
    this.sessions.delete(windowId)
    session.unsubscribeFrame()
    try {
      await session.cdpSession.Page.stopScreencast()
    } catch (err) {
      // The underlying target may already be gone (window closed, tab
      // navigated to a new target). Best-effort.
      logger.warn('stopScreencast threw', {
        windowId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private broadcast(
    session: ScreencastSession,
    message: ScreencastOutboundMessage,
  ): void {
    const payload = JSON.stringify(message)
    for (const ws of session.subscribers) {
      if (ws.readyState !== WS_OPEN) continue
      try {
        ws.send(payload)
      } catch (err) {
        logger.warn('Subscriber send failed; dropping subscriber', {
          windowId: session.windowId,
          error: err instanceof Error ? err.message : String(err),
        })
        session.subscribers.delete(ws)
      }
    }
  }

  private send(ws: Subscriber, message: ScreencastOutboundMessage): void {
    if (ws.readyState !== WS_OPEN) return
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // Best-effort.
    }
  }
}
