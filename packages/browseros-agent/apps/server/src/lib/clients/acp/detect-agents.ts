/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Detect which ACP agents are usable on this machine.
 *
 * For each acpx built-in:
 *   - parse the spawn command from the agent registry,
 *   - probe the underlying binary with `command -v` (PATH-based agents)
 *     OR scan the npx cache for a cached install (npx-fronted agents),
 *   - try `<bin> --version` for a version string when PATH-resolved
 *     (best-effort; some CLIs use non-standard flags),
 *   - overlay display metadata (display name, install URL) from
 *     `agent-registry-meta`.
 *
 * Auth state is *not* probed here — it's the user's responsibility to
 * be authenticated, and the dialog's Test button calls
 * `provider.prepare()` which exercises the real ACP session bring-up
 * with a definitive answer. Anything we'd compute here would be a
 * fragile, per-agent, often-stale signal that disagrees with Test.
 *
 * Probes run in parallel under a global timeout so a misbehaving
 * binary cannot hang the response.
 */

import { spawn } from 'node:child_process'
import { logger } from '../../logger'
import {
  ACP_AGENT_DISPLAY,
  type AcpAgentDisplayMeta,
  getDisplayMeta,
  parseNpxPackageName,
  parseSpawnCommand,
} from './agent-registry-meta'
import { probeNpxCache } from './npx-cache'
import { getSharedAcpAgentRegistry } from './runtime-singleton'

/** Categorical install state — sorts the rows in the settings dialog. */
export type AcpInstallState = 'installed' | 'npx-available' | 'not-installed'

/** Per-agent detection result returned to clients. */
export interface AcpAgentDetection {
  agentId: string
  displayName: string
  installState: AcpInstallState
  /**
   * @deprecated Derived from `installState`. Kept for one release of
   * back-compat with external consumers; new code should branch on
   * `installState` directly.
   */
  installed: boolean
  /** Best-effort version string (PATH-resolved binaries only). */
  version: string | null
  installUrl: string
  /** True when starting an ACP session right now is feasible — i.e. installState !== 'not-installed'. */
  acpReady: boolean
  /** True when the agent runs via `npx`. */
  npxBased: boolean
}

const PROBE_TIMEOUT_MS = 3_000

export interface DetectAgentsOptions {
  /** Override the agent id → spawn command mapping (testing). */
  resolveOverride?: (agentId: string) => string
  /** Override the binary probe (testing). */
  binProbeOverride?: (bin: string) => Promise<{
    found: boolean
    version: string | null
  }>
  /** Override the npx-cache probe (testing). */
  npxProbeOverride?: (packageName: string) => Promise<boolean>
  /** Override the timeout. */
  timeoutMs?: number
}

const STATE_ORDER: Record<AcpInstallState, number> = {
  installed: 0,
  'npx-available': 1,
  'not-installed': 2,
}

export async function detectAcpAgents(
  options: DetectAgentsOptions = {},
): Promise<AcpAgentDetection[]> {
  const registry = getSharedAcpAgentRegistry()
  const ids = registry.list()
  const resolve =
    options.resolveOverride ?? ((id: string) => registry.resolve(id))
  const binProbe = options.binProbeOverride ?? probeBinary
  const npxProbe = options.npxProbeOverride ?? probeNpxCache
  const timeout = options.timeoutMs ?? PROBE_TIMEOUT_MS

  const results = await Promise.all(
    ids.map(async (agentId) =>
      probeAgent(agentId, resolve, binProbe, npxProbe, timeout),
    ),
  )

  // Sort: installed first, then npx-available, then not-installed.
  // Within each group, alphabetical by display name. Settings UI
  // can render in three sections without re-sorting.
  return results.sort((a, b) => {
    const s = STATE_ORDER[a.installState] - STATE_ORDER[b.installState]
    if (s !== 0) return s
    return a.displayName.localeCompare(b.displayName)
  })
}

async function probeAgent(
  agentId: string,
  resolveCommand: (id: string) => string,
  binProbe: NonNullable<DetectAgentsOptions['binProbeOverride']>,
  npxProbe: NonNullable<DetectAgentsOptions['npxProbeOverride']>,
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
    return buildResult(agentId, overlay, 'not-installed', null, false)
  }

  const parsed = parseSpawnCommand(command)

  if (parsed.npxBased) {
    const pkg = parseNpxPackageName(command)
    const cached = pkg ? await npxProbe(pkg).catch(() => false) : false
    return buildResult(
      agentId,
      overlay,
      cached ? 'installed' : 'npx-available',
      null,
      true,
    )
  }

  const result = await withTimeout(binProbe(parsed.bin), timeoutMs).catch(
    (err) => {
      logger.debug('ACP binary probe errored', {
        agentId,
        bin: parsed.bin,
        error: err instanceof Error ? err.message : String(err),
      })
      return { found: false, version: null }
    },
  )
  return buildResult(
    agentId,
    overlay,
    result.found ? 'installed' : 'not-installed',
    result.version,
    false,
  )
}

function buildResult(
  agentId: string,
  overlay: AcpAgentDisplayMeta,
  installState: AcpInstallState,
  version: string | null,
  npxBased: boolean,
): AcpAgentDetection {
  return {
    agentId,
    displayName: overlay.displayName,
    installState,
    installed: installState !== 'not-installed',
    version,
    installUrl: overlay.installUrl,
    acpReady: installState !== 'not-installed',
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
