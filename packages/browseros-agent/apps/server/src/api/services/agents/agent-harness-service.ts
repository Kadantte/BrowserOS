/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AcpxRuntime } from '../../../lib/agents/acpx-runtime'
import { InMemoryAgentHistoryStore } from '../../../lib/agents/in-memory-history-store'
import {
  AgentProfileRegistry,
  DEFAULT_AGENT_PROFILES,
} from '../../../lib/agents/profiles'
import type {
  AgentHistoryPage,
  AgentHistoryStore,
  AgentProfile,
  AgentPromptInput,
  AgentRuntime,
  AgentSession,
  AgentStatus,
  AgentStreamEvent,
} from '../../../lib/agents/types'

export class AgentHarnessService {
  private readonly registry: AgentProfileRegistry
  readonly historyStore: AgentHistoryStore
  private readonly runtime: AgentRuntime

  constructor(
    deps: {
      profiles?: AgentProfile[]
      runtime?: AgentRuntime
      historyStore?: AgentHistoryStore
    } = {},
  ) {
    this.registry = new AgentProfileRegistry(
      deps.profiles ?? DEFAULT_AGENT_PROFILES,
    )
    this.historyStore = deps.historyStore ?? new InMemoryAgentHistoryStore()
    this.runtime = deps.runtime ?? new AcpxRuntime()
  }

  listProfiles(): AgentProfile[] {
    return this.registry.list()
  }

  getProfile(profileId: string): AgentProfile | null {
    return this.registry.get(profileId)
  }

  async status(profileId: string): Promise<AgentStatus> {
    const profile = this.requireProfile(profileId)
    return this.runtime.status(profile)
  }

  async listSessions(profileId: string): Promise<AgentSession[]> {
    this.requireProfile(profileId)
    return this.historyStore.listSessions(profileId)
  }

  async getHistory(input: {
    profileId: string
    sessionKey: string
  }): Promise<AgentHistoryPage> {
    this.requireProfile(input.profileId)
    return {
      ...input,
      items: await this.historyStore.list(input),
    }
  }

  async send(
    input: AgentPromptInput,
  ): Promise<ReadableStream<AgentStreamEvent>> {
    const profile = this.requireProfile(input.profileId)
    return this.runtime.send({ ...input, profile })
  }

  private requireProfile(profileId: string): AgentProfile {
    const profile = this.registry.get(profileId)
    if (!profile) {
      throw new UnknownAgentProfileError(profileId)
    }
    return profile
  }
}

export class UnknownAgentProfileError extends Error {
  constructor(readonly profileId: string) {
    super(`Unknown agent profile: ${profileId}`)
    this.name = 'UnknownAgentProfileError'
  }
}

let singleton: AgentHarnessService | null = null

export function getAgentHarnessService(): AgentHarnessService {
  singleton ??= new AgentHarnessService()
  return singleton
}
