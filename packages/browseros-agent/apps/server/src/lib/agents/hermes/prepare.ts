/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { copyFile, mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { HERMES_CONTAINER_HARNESS_DIR } from '@browseros/shared/constants/hermes'
import {
  getHermesAgentHomeHostDir,
  getHermesHarnessHostDir,
} from '../../../api/services/hermes/hermes-paths'
import type {
  PrepareAcpxAgentContextInput,
  PreparedAcpxAgentContext,
} from '../acpx-agent-adapter'
import {
  finishBrowserosManagedContext,
  prepareBrowserosManagedContext,
} from '../acpx-agent-common'

const HERMES_GLOBAL_HOME = join(homedir(), '.hermes')
// Files we copy from the user's global Hermes install into each per-agent
// HERMES_HOME on first use. Hermes owns them thereafter; we only seed when
// missing so a re-prepare won't clobber edits the agent has made.
const HERMES_SEED_FILES = ['config.yaml', '.env', 'auth.json'] as const

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function seedHermesHomeFromGlobal(agentHome: string): Promise<void> {
  if (!(await pathExists(HERMES_GLOBAL_HOME))) return
  await mkdir(agentHome, { recursive: true })
  for (const file of HERMES_SEED_FILES) {
    const src = join(HERMES_GLOBAL_HOME, file)
    const dest = join(agentHome, file)
    if (await pathExists(dest)) continue
    if (!(await pathExists(src))) continue
    await copyFile(src, dest)
  }
}

/**
 * Translate a host-side hermes home path to its in-container equivalent.
 * The container bind-mounts `<browserosDir>/vm/hermes/harness` (host)
 * onto `/data/agents/harness` (container), so paths under the host
 * harness root map cleanly to `/data/agents/harness/...` inside.
 *
 * Returns the original host path when it doesn't sit under the harness
 * root — used as a defensive escape hatch (tests that inject a custom
 * dir, or future host-process fallback that still goes through this
 * prepare step).
 */
function translateHermesHomeToContainerPath(
  hostHome: string,
  browserosDir: string,
): string {
  const harnessHostRoot = getHermesHarnessHostDir(browserosDir)
  if (hostHome === harnessHostRoot) return HERMES_CONTAINER_HARNESS_DIR
  if (hostHome.startsWith(`${harnessHostRoot}/`)) {
    return `${HERMES_CONTAINER_HARNESS_DIR}${hostHome.slice(harnessHostRoot.length)}`
  }
  return hostHome
}

/**
 * Prepares Hermes with a per-agent HERMES_HOME. Host-side seeding writes
 * the user's global hermes config (config.yaml/.env/auth.json) into the
 * per-agent home under `<browserosDir>/vm/hermes/harness/<id>/home` so
 * the container can read them via the bind mount; HERMES_HOME inside the
 * container is the container-side path (`/data/agents/harness/<id>/home`).
 */
export async function prepareHermesContext(
  input: PrepareAcpxAgentContextInput,
): Promise<PreparedAcpxAgentContext> {
  const common = await prepareBrowserosManagedContext(input)

  // Hermes-specific home lives under vm/ so it's reachable inside the
  // Lima VM; the shared `common.paths.agentHome` (under agents/harness)
  // is OUTSIDE the VM mount and would not be visible to nerdctl.
  const hermesAgentHome = getHermesAgentHomeHostDir({
    browserosDir: input.browserosDir,
    agentId: input.agent.id,
  })
  await mkdir(hermesAgentHome, { recursive: true })
  await seedHermesHomeFromGlobal(hermesAgentHome)

  const hermesAgentHomeInContainer = translateHermesHomeToContainerPath(
    hermesAgentHome,
    input.browserosDir,
  )

  return finishBrowserosManagedContext({
    ...common,
    commandEnv: {
      HERMES_HOME: hermesAgentHomeInContainer,
    },
    // Hermes runs inside a Lima container; the BrowserOS HTTP MCP server
    // lives on the host. `host.containers.internal` resolves to the VM
    // gateway (via --add-host on the hermes-agent container) so hermes can
    // reach the MCP endpoint that the harness injects via newSession.
    browserosMcpHost: 'host.containers.internal',
  })
}
