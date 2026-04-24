/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  OpenClawCliProvider,
  OpenClawCliProviderAuthStatus,
} from './types'

const CLAUDE_CLI_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5',
] as const

interface ClaudeAuthStatusPayload {
  loggedIn?: boolean
  email?: string
  subscriptionType?: string
}

function extractClaudeAuthStatusPayload(
  stdout: string,
): ClaudeAuthStatusPayload | null {
  // `claude auth status` emits one JSON object on stdout on both success
  // (exit 0) and the "not logged in" path (exit 1). Lima/nerdctl may add
  // a stderr line like `time="…" level=fatal msg="exec failed with exit
  // code 1"` when the inner command exits non-zero. Scan line by line
  // and return the first line that parses as a plain object.
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ClaudeAuthStatusPayload
      }
    } catch {
      // try next line
    }
  }
  return null
}

function parseClaudeAuthStatus(
  stdout: string,
  exitCode: number,
): OpenClawCliProviderAuthStatus {
  // Binary missing: npm install hasn't landed, or PATH is wrong.
  if (exitCode === 127 || /not found|No such file/i.test(stdout)) {
    return { installed: false, loggedIn: false }
  }

  const payload = extractClaudeAuthStatusPayload(stdout)
  if (payload) {
    return {
      installed: true,
      loggedIn: !!payload.loggedIn,
      accountLabel: payload.email,
      subscriptionLabel: payload.subscriptionType,
    }
  }

  return {
    installed: true,
    loggedIn: false,
    error: stdout.slice(0, 500) || 'claude auth status failed',
  }
}

export const CLAUDE_CLI_PROVIDER: OpenClawCliProvider = {
  id: 'claude-cli',
  displayName: 'Anthropic Claude CLI',
  description: 'Uses your Claude.ai subscription via the Claude Code CLI',
  npmPackage: '@anthropic-ai/claude-code',
  binary: 'claude',
  authStatusCommand: ['claude', 'auth', 'status'],
  // `claude auth login` in 2.1.x silently discards stdin. The REPL's
  // `/login` slash command, launched from a fresh `claude` invocation,
  // does accept a pasted token.
  authLoginCommand: 'claude /login',
  models: CLAUDE_CLI_MODELS,
  parseAuthStatus: parseClaudeAuthStatus,
}
