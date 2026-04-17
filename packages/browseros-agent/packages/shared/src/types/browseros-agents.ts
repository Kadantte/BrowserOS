/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type BrowserOsAgentAdapterType =
  | 'openclaw'
  | 'codex_local'
  | 'claude_local'

export interface BrowserOsAgentPaths {
  agentDir: string
  cwd: string
  contextDirs: string[]
}

export interface BrowserOsValidationState {
  status: 'ok' | 'error'
  checkedAt: string
  message: string
}

export interface BrowserOsStoredAgent {
  version: 1
  id: string
  name: string
  adapterType: BrowserOsAgentAdapterType
  paths: BrowserOsAgentPaths
  adapterConfig: Record<string, unknown>
  runtimeBinding: Record<string, unknown> | null
  lastValidation: BrowserOsValidationState | null
  createdAt: string
  updatedAt: string
}
