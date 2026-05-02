/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AcpxAdapterTurnInput } from '../acpx-agent-adapter'
import type { AgentStreamEvent } from '../types'

export async function maybeHandleOpenClawTurn(
  _input: AcpxAdapterTurnInput,
): Promise<ReadableStream<AgentStreamEvent> | null> {
  return null
}
