/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  AgentHistoryItem,
  AgentHistoryStore,
  AgentSession,
  HistoryInput,
} from './types'

export class InMemoryAgentHistoryStore implements AgentHistoryStore {
  private readonly items: AgentHistoryItem[] = []

  async append(
    item: Omit<AgentHistoryItem, 'createdAt'> & { createdAt?: number },
  ): Promise<void> {
    this.items.push({
      ...item,
      createdAt: item.createdAt ?? Date.now(),
    })
  }

  async list(input: HistoryInput): Promise<AgentHistoryItem[]> {
    return this.items.filter(
      (item) =>
        item.profileId === input.profileId &&
        item.sessionKey === input.sessionKey,
    )
  }

  async listSessions(profileId?: string): Promise<AgentSession[]> {
    const sessions = new Map<string, AgentSession>()
    for (const item of this.items) {
      if (profileId && item.profileId !== profileId) continue
      const key = `${item.profileId}:${item.sessionKey}`
      const existing = sessions.get(key)
      if (!existing || existing.updatedAt < item.createdAt) {
        sessions.set(key, {
          profileId: item.profileId,
          key: item.sessionKey,
          updatedAt: item.createdAt,
        })
      }
    }
    return [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
