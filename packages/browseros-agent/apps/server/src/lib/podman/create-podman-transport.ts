/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { PodmanApi } from './podman-api'
import { PodmanShell } from './podman-shell'
import type { PodmanTransport } from './podman-transport'

export function createPodmanTransport(
  input:
    | { mode: 'api'; socketPath: string }
    | { mode: 'shell'; limactlPath?: string; vmName: string },
): PodmanTransport {
  if (input.mode === 'api') {
    return new PodmanApi({ socketPath: input.socketPath })
  }

  return new PodmanShell({
    limactlPath: input.limactlPath,
    vmName: input.vmName,
  })
}
