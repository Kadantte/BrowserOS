/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Hand-curated metadata overlay for the acpx built-in agent registry.
 *
 * The source of truth for *which* agents exist is `acpx/runtime`'s
 * `createAgentRegistry().list()`. This file adds the human-facing
 * details acpx itself doesn't ship (display name, install URL) keyed
 * by the same agent id. New acpx built-ins automatically surface in
 * detection; they just lack the pretty overlay until someone adds an
 * entry here.
 */

/** Display + install metadata for a single ACP built-in agent. */
export interface AcpAgentDisplayMeta {
  /** Pretty name shown in the settings UI. */
  displayName: string
  /** Where to send the user to install. */
  installUrl: string
}

/**
 * Overlay table. Keys are acpx built-in agent ids. Missing keys = the
 * agent is enumerated from acpx but rendered with a generic fallback.
 */
export const ACP_AGENT_DISPLAY: Record<string, AcpAgentDisplayMeta> = {
  claude: {
    displayName: 'Claude Code',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  },
  codex: {
    displayName: 'Codex',
    installUrl: 'https://github.com/openai/codex',
  },
  gemini: {
    displayName: 'Gemini',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  copilot: {
    displayName: 'GitHub Copilot',
    installUrl: 'https://docs.github.com/en/copilot/github-copilot-in-the-cli',
  },
  cursor: {
    displayName: 'Cursor',
    installUrl: 'https://cursor.com/cli',
  },
  pi: {
    displayName: 'Pi',
    installUrl: 'https://www.npmjs.com/package/pi-acp',
  },
  openclaw: {
    displayName: 'OpenClaw',
    installUrl: 'https://docs.openclaw.ai/cli/acp',
  },
  droid: {
    displayName: 'Droid (Factory)',
    installUrl: 'https://docs.factory.ai/cli/getting-started',
  },
  iflow: {
    displayName: 'iFlow',
    installUrl: 'https://github.com/iflow-ai/iflow-cli',
  },
  kilocode: {
    displayName: 'KiloCode',
    installUrl: 'https://www.npmjs.com/package/@kilocode/cli',
  },
  kimi: {
    displayName: 'Kimi',
    installUrl: 'https://platform.moonshot.ai/docs',
  },
  kiro: {
    displayName: 'Kiro',
    installUrl: 'https://kiro.dev',
  },
  opencode: {
    displayName: 'OpenCode',
    installUrl: 'https://www.npmjs.com/package/opencode-ai',
  },
  qoder: {
    displayName: 'Qoder',
    installUrl: 'https://qoder.com',
  },
  qwen: {
    displayName: 'Qwen',
    installUrl: 'https://github.com/QwenLM/qwen-code',
  },
  trae: {
    displayName: 'Trae',
    installUrl: 'https://docs.trae.ai',
  },
}

/** Fallback when an acpx built-in has no overlay entry yet. */
export function getDisplayMeta(agentId: string): AcpAgentDisplayMeta {
  const overlay = ACP_AGENT_DISPLAY[agentId]
  if (overlay) return overlay
  return {
    displayName: agentId,
    installUrl: 'https://github.com/DaniAkash/acpx',
  }
}

/**
 * Parse an acpx spawn command string into something probeable.
 *
 * acpx's `registry.resolve(agentId)` returns commands like:
 *   - `claude` → `npx -y @agentclientprotocol/claude-agent-acp@^0.31.0`
 *   - `gemini` → `gemini --acp`
 *   - `openclaw` → `openclaw acp`
 *
 * For `npx`-fronted agents we probe the npx cache (see `npx-cache.ts`)
 * to know whether the package is on disk or will be fetched at first
 * use. For everything else, the first token is the binary that must be
 * on PATH for the agent to start.
 */
export interface ParsedSpawnCommand {
  /** True when the agent runs via `npx <package>` and is auto-fetched. */
  npxBased: boolean
  /** Binary name to probe with `command -v` (only meaningful when !npxBased). */
  bin: string
}

export function parseSpawnCommand(command: string): ParsedSpawnCommand {
  const tokens = command.trim().split(/\s+/)
  const head = tokens[0] ?? ''
  if (head === 'npx' || head === 'npm' || head === 'pnpm' || head === 'yarn') {
    return { npxBased: true, bin: head }
  }
  return { npxBased: false, bin: head }
}

/**
 * Extract the npm package name from an `npx`-fronted command.
 *
 * Examples:
 *   `npx -y @agentclientprotocol/claude-agent-acp@^0.31.0`
 *     → `@agentclientprotocol/claude-agent-acp`
 *   `npx pi-acp@^0.0.26` → `pi-acp`
 *   `npx -y @kilocode/cli acp` → `@kilocode/cli`
 *   `npx -y opencode-ai acp` → `opencode-ai`
 *   `gemini --acp` → null (not npx)
 *
 * Scoped names (leading `@`) keep the prefix. The trailing `@<spec>`
 * version pin is stripped (only the *last* `@` in the token —
 * `@scope/pkg` has its `@` at index 0 which we deliberately preserve).
 */
export function parseNpxPackageName(command: string): string | null {
  const tokens = command.trim().split(/\s+/)
  if (tokens[0] !== 'npx') return null
  // First non-flag positional after `npx`. Skips -y / --yes / --silent
  // / etc.
  const pkgIndex = tokens.findIndex(
    (token, idx) => idx > 0 && !token.startsWith('-'),
  )
  if (pkgIndex < 0) return null
  const raw = tokens[pkgIndex] ?? ''
  if (!raw) return null
  // Strip a trailing version pin only — the leading `@` of a scoped
  // name is always at index 0, so we look for an `@` at index > 0.
  const lastAt = raw.lastIndexOf('@')
  if (lastAt > 0) return raw.slice(0, lastAt)
  return raw
}
