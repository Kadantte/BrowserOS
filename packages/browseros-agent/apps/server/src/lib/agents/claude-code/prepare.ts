/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  PrepareAcpxAgentContextInput,
  PreparedAcpxAgentContext,
} from '../acpx-agent-adapter'
import {
  finishBrowserosManagedContext,
  prepareBrowserosManagedContext,
} from '../acpx-agent-common'
import { materializeClaudeConfig } from '../acpx-runtime-context'

/** Prepares Claude Code with a contained config dir and BrowserOS agent home. */
export async function prepareClaudeCodeContext(
  input: PrepareAcpxAgentContextInput,
): Promise<PreparedAcpxAgentContext> {
  const common = await prepareBrowserosManagedContext(input)
  await materializeClaudeConfig({ paths: common.paths })
  return finishBrowserosManagedContext({
    ...common,
    commandEnv: {
      AGENT_HOME: common.paths.agentHome,
      CLAUDE_CONFIG_DIR: common.paths.claudeConfigDir,
    },
  })
}
