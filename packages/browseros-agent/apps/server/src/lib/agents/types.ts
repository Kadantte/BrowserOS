/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type AgentBackend = 'acpx'

export type AgentPermissionMode = 'approve-all' | 'approve-reads' | 'deny-all'

export type AgentNonInteractivePermissionPolicy = 'deny' | 'fail'

export interface AgentProfile {
  id: string
  name: string
  backend: AgentBackend
  agent: string
  cwd?: string
  permissionMode?: AgentPermissionMode
}

export interface AgentStatus {
  state: 'ready' | 'unknown' | 'error'
  message?: string
}

export interface AgentSession {
  profileId: string
  key: string
  updatedAt: number
}

export interface AgentHistoryItem {
  profileId: string
  sessionKey: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface AgentHistoryPage {
  profileId: string
  sessionKey: string
  items: AgentHistoryItem[]
}

export interface HistoryInput {
  profileId: string
  sessionKey: string
}

export type AgentStreamEvent =
  | {
      type: 'text_delta'
      text: string
      stream: 'output' | 'thought'
      rawType?: string
    }
  | {
      type: 'tool_call'
      text: string
      title: string
      id?: string
      status?: string
      rawType?: string
    }
  | {
      type: 'status'
      text: string
      rawType?: string
    }
  | {
      type: 'done'
      text?: string
      stopReason?: string
    }
  | {
      type: 'error'
      message: string
      code?: string
    }

export interface AgentPromptInput {
  profileId: string
  sessionKey: string
  message: string
  cwd?: string
  permissionMode?: AgentPermissionMode
  nonInteractivePermissions?: AgentNonInteractivePermissionPolicy
  timeoutMs?: number
  signal?: AbortSignal
}

export interface ResolvedAgentPromptInput extends AgentPromptInput {
  profile: AgentProfile
}

export interface AgentRuntime {
  status(profile: AgentProfile): Promise<AgentStatus>
  listSessions(profile: AgentProfile): Promise<AgentSession[]>
  getHistory(
    input: HistoryInput & { profile: AgentProfile },
  ): Promise<AgentHistoryPage>
  send(
    input: ResolvedAgentPromptInput,
  ): Promise<ReadableStream<AgentStreamEvent>>
  cancel?(input: {
    profile: AgentProfile
    sessionKey: string
    reason?: string
  }): Promise<void>
}

export interface AgentHistoryStore {
  append(
    item: Omit<AgentHistoryItem, 'createdAt'> & { createdAt?: number },
  ): Promise<void>
  list(input: HistoryInput): Promise<AgentHistoryItem[]>
  listSessions(profileId?: string): Promise<AgentSession[]>
}
