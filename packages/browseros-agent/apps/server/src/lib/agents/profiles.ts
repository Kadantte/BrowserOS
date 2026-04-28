/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AgentProfile } from './types'

export const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    backend: 'acpx',
    agent: 'claude',
    permissionMode: 'approve-reads',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    backend: 'acpx',
    agent: 'openclaw',
    permissionMode: 'approve-reads',
  },
]

export class AgentProfileRegistry {
  private readonly profiles: Map<string, AgentProfile>

  constructor(profiles: AgentProfile[] = DEFAULT_AGENT_PROFILES) {
    this.profiles = new Map(profiles.map((profile) => [profile.id, profile]))
  }

  list(): AgentProfile[] {
    return [...this.profiles.values()]
  }

  get(profileId: string): AgentProfile | null {
    return this.profiles.get(profileId) ?? null
  }
}
