/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Host-side path helpers for the Hermes container.
 *
 * Hermes per-agent state lives under the BrowserOS-managed VM state
 * directory (so it's reachable inside the Lima VM via the existing
 * vm/ → /mnt/browseros/vm bind mount). The Hermes container then bind-
 * mounts the guest-side path (/mnt/browseros/vm/hermes/harness) into
 * /data/agents/harness, so `HERMES_HOME` ends up pointing at a path
 * the container can actually open.
 */

import { join } from 'node:path'
import { getVmStateDir } from '../../../lib/browseros-dir'

/** Top-level Hermes state directory: `<browserosDir>/vm/hermes`. */
export function getHermesHostStateDir(browserosDir?: string): string {
  return join(
    browserosDir ? join(browserosDir, 'vm') : getVmStateDir(),
    'hermes',
  )
}

/** Per-agent harness root: `<browserosDir>/vm/hermes/harness`. */
export function getHermesHarnessHostDir(browserosDir?: string): string {
  return join(getHermesHostStateDir(browserosDir), 'harness')
}

/**
 * Per-agent home directory on the host. Stays parallel to the
 * Claude/Codex layout so prepare.ts can seed config.yaml/.env/auth.json
 * here before the container reads them via the bind mount.
 */
export function getHermesAgentHomeHostDir(input: {
  browserosDir?: string
  agentId: string
}): string {
  return join(
    getHermesHarnessHostDir(input.browserosDir),
    input.agentId,
    'home',
  )
}
