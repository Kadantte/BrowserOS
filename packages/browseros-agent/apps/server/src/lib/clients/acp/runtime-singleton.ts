/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Shared `AcpRuntime` instance for the ACP provider category.
 *
 * One process-wide runtime is reused across:
 *   - the agent detector (where we may call `runtime.doctor()` to
 *     surface auth state for agents that support it),
 *   - the provider factory (which builds an `AcpxProvider` per
 *     conversation but shares this runtime to keep the ACP child
 *     processes warm), and
 *   - the test-connection endpoint (which calls `provider.prepare()`
 *     using the same runtime to validate setup without sending a real
 *     prompt).
 *
 * Lazy: the runtime spawns nothing until the first call. State lives
 * under `~/.browseros/acpx` so it doesn't collide with anything else.
 */

import os from 'node:os'
import path from 'node:path'
import {
  type AcpAgentRegistry,
  type AcpRuntime,
  createAcpRuntime,
  createAgentRegistry,
  createFileSessionStore,
} from 'acpx/runtime'

let runtime: AcpRuntime | null = null
let registry: AcpAgentRegistry | null = null

/** acpx state directory. Override in tests by setting `ACPX_STATE_DIR`. */
function getAcpxStateDir(): string {
  return (
    process.env.ACPX_STATE_DIR ?? path.join(os.homedir(), '.browseros', 'acpx')
  )
}

/**
 * Lazy-build the shared `AcpRuntime`. Call sites must treat the
 * returned reference as long-lived; do not close it from caller code
 * (use `closeSharedAcpRuntime` for orderly shutdown).
 */
export function getSharedAcpRuntime(): AcpRuntime {
  if (!runtime) {
    runtime = createAcpRuntime({
      // The runtime requires a default cwd at construction time, but
      // every call site overrides it via `ensureSession({ cwd, … })`,
      // so the value here is effectively a no-op fallback.
      cwd: process.cwd(),
      sessionStore: createFileSessionStore({ stateDir: getAcpxStateDir() }),
      agentRegistry: getSharedAcpAgentRegistry(),
      permissionMode: 'approve-reads',
      nonInteractivePermissions: 'deny',
    })
  }
  return runtime
}

/**
 * Standalone agent registry, suitable for cheap enumeration that
 * doesn't need a full runtime (e.g. detection's binary probe).
 */
export function getSharedAcpAgentRegistry(): AcpAgentRegistry {
  if (!registry) registry = createAgentRegistry()
  return registry
}

/** Tear down the runtime. Idempotent. */
export async function closeSharedAcpRuntime(): Promise<void> {
  if (!runtime) return
  const owned = runtime
  runtime = null
  // The runtime exposes `close` per-handle; closing a runtime with no
  // open handles is a best-effort no-op. Wrap defensively because this
  // can fire during process shutdown when the underlying child is
  // already dead.
  const closer = (owned as { dispose?: () => Promise<void> }).dispose
  if (typeof closer === 'function') {
    await closer.call(owned).catch(() => {})
  }
}
