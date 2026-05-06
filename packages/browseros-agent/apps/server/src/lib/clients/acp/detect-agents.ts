/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Detect which ACP agents are usable on this machine.
 *
 * For each acpx built-in:
 *   - parse the spawn command from the agent registry,
 *   - probe the underlying binary with `command -v` (skipped for
 *     `npx`-fronted agents — npx auto-fetches them),
 *   - try `<bin> --version` for a version string (best-effort, may
 *     fail for agents with non-standard flags),
 *   - overlay display metadata (display name, install URL, auth hint)
 *     from `agent-registry-meta`.
 *
 * Probes run in parallel under a global timeout so a misbehaving
 * binary cannot hang the response. Auth state is reported as
 * `'unknown'` here; callers wanting a definitive auth verdict use the
 * `/test-provider` flow which exercises the full session-prepare path.
 */

import { spawn } from 'node:child_process'
import { logger } from '../../logger'
import {
  ACP_AGENT_DISPLAY,
  type AcpAgentDisplayMeta,
  getDisplayMeta,
  parseSpawnCommand,
} from './agent-registry-meta'
import { getSharedAcpAgentRegistry } from './runtime-singleton'

/** Per-agent detection result returned to clients. */
export interface AcpAgentDetection {
  agentId: string
  displayName: string
  installed: boolean
  version: string | null
  authenticated: boolean | 'unknown'
  authHint: string | null
  installUrl: string
  /** True when the agent is ready to start an ACP session right now. */
  acpReady: boolean
  /** True when the agent runs via `npx` (auto-fetch on first use). */
  npxBased: boolean
}

const PROBE_TIMEOUT_MS = 3_000

export interface DetectAgentsOptions {
  /** Override the agent id → spawn command mapping (testing). */
  resolveOverride?: (agentId: string) => string
  /** Override the binary probe (testing). */
  probeOverride?: (bin: string) => Promise<{
    found: boolean
    version: string | null
  }>
  /** Override the timeout. */
  timeoutMs?: number
}

export async function detectAcpAgents(
  options: DetectAgentsOptions = {},
): Promise<AcpAgentDetection[]> {
  const registry = getSharedAcpAgentRegistry()
  const ids = registry.list()
  const resolve =
    options.resolveOverride ?? ((id: string) => registry.resolve(id))
  const probe = options.probeOverride ?? probeBinary
  const timeout = options.timeoutMs ?? PROBE_TIMEOUT_MS

  const results = await Promise.all(
    ids.map(async (agentId) => probeAgent(agentId, resolve, probe, timeout)),
  )

  // Sort: installed first (alphabetical within), then not-installed
  // (alphabetical), so the settings UI can render a sensible default
  // grouping without re-sorting.
  return results.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })
}

async function probeAgent(
  agentId: string,
  resolveCommand: (id: string) => string,
  probe: NonNullable<DetectAgentsOptions['probeOverride']>,
  timeoutMs: number,
): Promise<AcpAgentDetection> {
  const overlay: AcpAgentDisplayMeta = getDisplayMeta(agentId)
  let command: string
  try {
    command = resolveCommand(agentId)
  } catch (err) {
    logger.warn('ACP agent registry resolve failed', {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    })
    return notInstalled(agentId, overlay, false)
  }

  const parsed = parseSpawnCommand(command)

  if (parsed.npxBased) {
    // npx-fronted agents are always "ready" — npx will fetch the
    // package on first use. We can't know an exact version without
    // actually running npx (slow + side-effects), so version stays
    // null until the user runs the agent for real.
    return {
      agentId,
      displayName: overlay.displayName,
      installed: true,
      version: null,
      authenticated: 'unknown',
      authHint: overlay.authHint,
      installUrl: overlay.installUrl,
      acpReady: true,
      npxBased: true,
    }
  }

  const result = await withTimeout(probe(parsed.bin), timeoutMs).catch(
    (err) => {
      logger.debug('ACP binary probe errored', {
        agentId,
        bin: parsed.bin,
        error: err instanceof Error ? err.message : String(err),
      })
      return { found: false, version: null }
    },
  )

  if (!result.found) return notInstalled(agentId, overlay, false)

  return {
    agentId,
    displayName: overlay.displayName,
    installed: true,
    version: result.version,
    authenticated: 'unknown',
    authHint: overlay.authHint,
    installUrl: overlay.installUrl,
    acpReady: true,
    npxBased: false,
  }
}

function notInstalled(
  agentId: string,
  overlay: AcpAgentDisplayMeta,
  npxBased: boolean,
): AcpAgentDetection {
  return {
    agentId,
    displayName: overlay.displayName,
    installed: false,
    version: null,
    authenticated: 'unknown',
    authHint: overlay.authHint,
    installUrl: overlay.installUrl,
    acpReady: false,
    npxBased,
  }
}

/** `command -v <bin>` + `<bin> --version`. */
async function probeBinary(
  bin: string,
): Promise<{ found: boolean; version: string | null }> {
  const found = await runCommand('command', ['-v', bin]).then(
    (r) => r.code === 0 && r.stdout.trim().length > 0,
  )
  if (!found) return { found: false, version: null }

  const versionResult = await runCommand(bin, ['--version']).catch(() => null)
  const version =
    versionResult && versionResult.code === 0
      ? (versionResult.stdout.trim().split('\n')[0] ?? null)
      : null
  return { found: true, version: version || null }
}

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

function runCommand(cmd: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    // `command -v` is a shell builtin — invoke through `sh -c` for it.
    const child =
      cmd === 'command'
        ? spawn('sh', ['-c', `command -v ${args[1]}`])
        : spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Probe timed out after ${ms}ms`)),
        ms,
      )
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** For tests: enumerated overlay coverage. */
export function _enumerateOverlayKeys(): string[] {
  return Object.keys(ACP_AGENT_DISPLAY)
}
