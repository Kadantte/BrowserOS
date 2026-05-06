/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Hand-curated metadata overlay for the acpx built-in agent registry.
 *
 * The source of truth for *which* agents exist is `acpx/runtime`'s
 * `createAgentRegistry().list()`. This file adds the human-facing
 * details acpx itself doesn't ship (display name, install URL, auth
 * hint) keyed by the same agent id. New acpx built-ins automatically
 * surface in detection; they just lack the pretty overlay until
 * someone adds an entry here.
 */

/** Display + install metadata for a single ACP built-in agent. */
export interface AcpAgentDisplayMeta {
  /** Pretty name shown in the settings UI. */
  displayName: string
  /** Where to send the user to install. */
  installUrl: string
  /** Short instruction shown when the binary is present but unauthenticated. */
  authHint: string | null
  /**
   * Whether this agent's underlying ACP bridge supports a `runtime.doctor()`
   * call we can introspect for auth state. Most don't; for those we only
   * surface install + auth hint, never a definitive "authenticated" yes/no.
   */
  supportsDoctor: boolean
}

/**
 * Overlay table. Keys are acpx built-in agent ids. Missing keys = the
 * agent is enumerated from acpx but rendered with a generic fallback.
 */
export const ACP_AGENT_DISPLAY: Record<string, AcpAgentDisplayMeta> = {
  claude: {
    displayName: 'Claude Code',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    authHint: 'Run `claude login`',
    supportsDoctor: true,
  },
  codex: {
    displayName: 'Codex',
    installUrl: 'https://github.com/openai/codex',
    authHint: 'Run `codex login`',
    supportsDoctor: true,
  },
  gemini: {
    displayName: 'Gemini',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
    authHint: 'Run `gemini` and complete the auth flow',
    supportsDoctor: false,
  },
  copilot: {
    displayName: 'GitHub Copilot',
    installUrl: 'https://docs.github.com/en/copilot/github-copilot-in-the-cli',
    authHint: 'Run `gh auth login`',
    supportsDoctor: false,
  },
  cursor: {
    displayName: 'Cursor',
    installUrl: 'https://cursor.com/cli',
    authHint: 'Sign in to Cursor and ensure `cursor-agent` is on PATH',
    supportsDoctor: false,
  },
  pi: {
    displayName: 'Pi',
    installUrl: 'https://www.npmjs.com/package/pi-acp',
    authHint: null,
    supportsDoctor: false,
  },
  openclaw: {
    displayName: 'OpenClaw',
    installUrl: 'https://docs.openclaw.ai/cli/acp',
    authHint: null,
    supportsDoctor: false,
  },
  droid: {
    displayName: 'Droid (Factory)',
    installUrl: 'https://docs.factory.ai/cli/getting-started',
    authHint: 'Run `droid auth`',
    supportsDoctor: false,
  },
  iflow: {
    displayName: 'iFlow',
    installUrl: 'https://github.com/iflow-ai/iflow-cli',
    authHint: null,
    supportsDoctor: false,
  },
  kilocode: {
    displayName: 'KiloCode',
    installUrl: 'https://www.npmjs.com/package/@kilocode/cli',
    authHint: null,
    supportsDoctor: false,
  },
  kimi: {
    displayName: 'Kimi',
    installUrl: 'https://platform.moonshot.ai/docs',
    authHint: null,
    supportsDoctor: false,
  },
  kiro: {
    displayName: 'Kiro',
    installUrl: 'https://kiro.dev',
    authHint: null,
    supportsDoctor: false,
  },
  opencode: {
    displayName: 'OpenCode',
    installUrl: 'https://www.npmjs.com/package/opencode-ai',
    authHint: null,
    supportsDoctor: false,
  },
  qoder: {
    displayName: 'Qoder',
    installUrl: 'https://qoder.com',
    authHint: null,
    supportsDoctor: false,
  },
  qwen: {
    displayName: 'Qwen',
    installUrl: 'https://github.com/QwenLM/qwen-code',
    authHint: null,
    supportsDoctor: false,
  },
  trae: {
    displayName: 'Trae',
    installUrl: 'https://docs.trae.ai',
    authHint: null,
    supportsDoctor: false,
  },
}

/** Fallback when an acpx built-in has no overlay entry yet. */
export function getDisplayMeta(agentId: string): AcpAgentDisplayMeta {
  const overlay = ACP_AGENT_DISPLAY[agentId]
  if (overlay) return overlay
  return {
    displayName: agentId,
    installUrl: 'https://github.com/DaniAkash/acpx',
    authHint: null,
    supportsDoctor: false,
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
 * For `npx`-fronted agents we never need a PATH probe (npx is always
 * present in a Node env and will fetch the package on first use).
 * For everything else, the first token is the binary that must be on
 * PATH for the agent to start.
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
