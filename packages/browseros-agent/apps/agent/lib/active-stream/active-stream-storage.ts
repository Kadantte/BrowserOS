import { storage } from '@wxt-dev/storage'
import type { ChatStatus, UIMessage } from 'ai'

export interface ActiveStreamState {
  conversationId: string
  messages: UIMessage[]
  status: ChatStatus
  lastUpdated: number
  followerTabIds: number[]
}

/**
 * Map of conversationId → ActiveStreamState.
 * Supports multiple parallel agent executions without overwriting each other.
 */
export type ActiveStreamsMap = Record<string, ActiveStreamState>

export const activeStreamsStorage = storage.defineItem<ActiveStreamsMap>(
  'session:active-streams',
  { fallback: {} },
)

/**
 * Extract all unique tabIds from tool output metadata in messages.
 * The server attaches metadata.tabId to every tool that operates on or creates a page.
 */
export function extractToolTabIds(messages: UIMessage[]): number[] {
  const tabIds = new Set<number>()
  for (const message of messages) {
    if (!message.parts) continue
    for (const part of message.parts) {
      const typedPart = part as { type?: string; output?: unknown }
      if (!typedPart.type?.startsWith('tool-')) continue

      const output = typedPart.output as
        | { metadata?: { tabId?: number } }
        | undefined
      if (output?.metadata?.tabId) {
        tabIds.add(output.metadata.tabId)
      }
    }
  }
  return [...tabIds]
}

/** Write a single conversation's stream state into the map. */
export async function setActiveStream(state: ActiveStreamState): Promise<void> {
  const map = await activeStreamsStorage.getValue()
  map[state.conversationId] = state
  await activeStreamsStorage.setValue(map)
}

/** Remove a conversation's entry from the map. */
export async function clearActiveStream(conversationId: string): Promise<void> {
  const map = await activeStreamsStorage.getValue()
  delete map[conversationId]
  await activeStreamsStorage.setValue(map)
}

/** Find which active stream (if any) includes the given tabId as a follower. */
export function findStreamForTab(
  map: ActiveStreamsMap,
  tabId: number,
): ActiveStreamState | undefined {
  for (const state of Object.values(map)) {
    if (state.followerTabIds.includes(tabId)) return state
  }
  return undefined
}
