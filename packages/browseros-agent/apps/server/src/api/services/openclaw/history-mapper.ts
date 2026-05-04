/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Converts an aggregated OpenClaw session history (rich content blocks
 * across the agent's main + sub-sessions) into the flat AgentHistoryPage
 * shape the chat panel consumes.
 *
 * Input: OpenClawSessionHistory.messages — each message has `content`
 *   that is either a string OR an array of typed blocks
 *   ({type: 'text'|'thinking'|'toolCall'|'toolResult'}). The HTTP endpoint
 *   returns the array form even though the type definition says string.
 *
 * Output: AgentHistoryEntry[] — flat text per entry, separate `reasoning`
 *   and `toolCalls` fields the UI renders as collapsible sections.
 *
 * Tool result pairing: `toolCall` blocks emit on assistant messages;
 * the matching `toolResult` arrives in a later message (typically with
 * role 'tool' or 'toolResult'). We pair them by `toolCallId` so the
 * resulting AgentHistoryToolCall has both input and output.
 */

import type {
  AgentHistoryEntry,
  AgentHistoryToolCall,
} from '../../../lib/agents/agent-types'
import type { AgentHistoryPage } from '../../../lib/agents/types'
import type {
  OpenClawSessionHistory,
  OpenClawSessionHistoryMessage,
} from './openclaw-http-client'

type RichBlock =
  | { type: 'text'; text?: string }
  | { type: 'thinking'; thinking?: string; text?: string }
  | {
      type: 'toolCall'
      id?: string
      toolCallId?: string
      name?: string
      arguments?: unknown
    }
  | {
      type: 'toolResult'
      toolCallId?: string
      content?: unknown
      isError?: boolean
    }
  | { type: string; [key: string]: unknown }

// We hold the AgentHistoryToolCall reference itself in `pending` so a
// later `toolResult` block mutates the same object that was already
// pushed onto the assistant entry's `toolCalls` array.
type PendingToolCall = AgentHistoryToolCall

export function convertOpenClawHistoryToAgentHistory(
  agentId: string,
  raw: OpenClawSessionHistory,
): AgentHistoryPage {
  const items: AgentHistoryEntry[] = []
  // Resolved tool calls keyed by toolCallId — used to attach `output`
  // back to the assistant entry that issued the call once the tool
  // result arrives in a subsequent message.
  const pendingByToolCallId = new Map<string, PendingToolCall>()

  let entryCounter = 0
  const nextId = () => `${agentId}:hist:${entryCounter++}`

  for (const message of raw.messages) {
    const blocks = normalizeBlocks(message)
    const role = normalizeRole(message.role)

    if (!role) {
      // 'system' / 'tool' messages aren't shown as their own chat entries;
      // tool results get folded into the assistant entry they complete.
      if (message.role === 'tool') {
        applyToolResults(blocks, pendingByToolCallId)
      }
      continue
    }

    const text = collectText(blocks).trim()
    const reasoningText = collectThinking(blocks).trim()
    const toolCallEntries = collectToolCalls(blocks, pendingByToolCallId)

    // Skip entries that would render as completely empty cards. A turn
    // that is *only* tool calls still has value — the user sees what
    // tools the agent reached for — so don't filter those.
    if (!text && !reasoningText && toolCallEntries.length === 0) continue

    const entry: AgentHistoryEntry = {
      id: message.messageId ?? nextId(),
      agentId,
      sessionId: 'main',
      role,
      text,
      createdAt: message.timestamp ?? 0,
    }
    if (reasoningText) {
      entry.reasoning = { text: reasoningText }
    }
    if (toolCallEntries.length > 0) {
      entry.toolCalls = toolCallEntries
    }

    items.push(entry)
  }

  return {
    agentId,
    sessionId: 'main',
    items,
  }
}

function normalizeBlocks(message: OpenClawSessionHistoryMessage): RichBlock[] {
  const content = (message as { content: unknown }).content
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : []
  }
  if (Array.isArray(content)) {
    return content as RichBlock[]
  }
  return []
}

function normalizeRole(
  role: OpenClawSessionHistoryMessage['role'],
): 'user' | 'assistant' | null {
  if (role === 'user' || role === 'assistant') return role
  return null
}

function collectText(blocks: RichBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function collectThinking(blocks: RichBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'thinking') {
      const value =
        typeof block.thinking === 'string'
          ? block.thinking
          : typeof block.text === 'string'
            ? block.text
            : ''
      if (value) parts.push(value)
    }
  }
  return parts.join('\n\n')
}

function collectToolCalls(
  blocks: RichBlock[],
  pending: Map<string, PendingToolCall>,
): AgentHistoryToolCall[] {
  const out: AgentHistoryToolCall[] = []
  for (const block of blocks) {
    if (block.type !== 'toolCall') continue
    const callId =
      typeof block.toolCallId === 'string'
        ? block.toolCallId
        : typeof block.id === 'string'
          ? block.id
          : undefined
    if (!callId) continue
    const toolName = typeof block.name === 'string' ? block.name : 'unknown'
    const entry: AgentHistoryToolCall = {
      toolCallId: callId,
      toolName,
      status: 'completed',
      input: block.arguments,
    }
    out.push(entry)
    // Hold the same reference so a later toolResult mutates the entry
    // already pushed onto the assistant's toolCalls array.
    pending.set(callId, entry)
  }
  return out
}

function applyToolResults(
  blocks: RichBlock[],
  pending: Map<string, PendingToolCall>,
): void {
  for (const block of blocks) {
    if (block.type !== 'toolResult') continue
    const callId =
      typeof block.toolCallId === 'string' ? block.toolCallId : undefined
    if (!callId) continue
    const entry = pending.get(callId)
    if (!entry) continue
    if (block.isError) {
      entry.status = 'failed'
      entry.error =
        typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content)
    } else {
      entry.output = block.content
    }
  }
}
