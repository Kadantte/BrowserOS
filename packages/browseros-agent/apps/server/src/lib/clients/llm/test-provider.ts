/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import os from 'node:os'
import { TIMEOUTS } from '@browseros/shared/constants/timeouts'
import { LLM_PROVIDERS, type LLMConfig } from '@browseros/shared/schemas/llm'
import {
  AcpxAgentNotFoundError,
  AcpxAuthRequiredError,
  createAcpxProvider,
} from 'acpx-ai-provider'
import { streamText } from 'ai'
import { getBrowserOSMcpUrl } from '../acp/mcp-url'
import { getSharedAcpRuntime } from '../acp/runtime-singleton'
import { resolveLLMConfig } from './config'
import { createLLMProvider } from './provider'

export interface ProviderTestConfig extends LLMConfig {
  model: string
  upstreamProvider?: string
}

export interface ProviderTestResult {
  success: boolean
  message: string
  responseTime?: number
}

const TEST_PROMPT = "Respond with exactly: 'ok'"

export async function testProviderConnection(
  config: ProviderTestConfig,
  browserosId?: string,
): Promise<ProviderTestResult> {
  const startTime = performance.now()

  // ACP: bypass the standard streamText path. We can't send a real
  // prompt without spawning an ACP child + a session, so we instead
  // pre-warm the session via provider.prepare() — that exercises the
  // full bring-up path (binary lookup, auth check, capabilities
  // exchange) and surfaces a structured error if anything is missing.
  if (config.provider === LLM_PROVIDERS.ACP) {
    return testAcpProvider(config, startTime)
  }

  try {
    const resolvedConfig = await resolveLLMConfig(config, browserosId)
    const model = createLLMProvider(resolvedConfig)

    // streamText works for all providers including Codex (which requires streaming)
    const stream = streamText({
      model,
      messages: [{ role: 'user', content: TEST_PROMPT }],
      abortSignal: AbortSignal.timeout(TIMEOUTS.TEST_PROVIDER),
    })
    const text = await stream.text
    const responseTime = Math.round(performance.now() - startTime)

    if (text) {
      const preview = text.length > 100 ? `${text.slice(0, 100)}...` : text
      return {
        success: true,
        message: `Connection successful. Response: "${preview}"`,
        responseTime,
      }
    }

    return {
      success: true,
      message: 'Connection successful. Provider responded.',
      responseTime,
    }
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime)
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      message: `[${config.provider}] ${errorMessage}`,
      responseTime,
    }
  }
}

async function testAcpProvider(
  config: ProviderTestConfig,
  startTime: number,
): Promise<ProviderTestResult> {
  if (!config.acpAgentId) {
    return {
      success: false,
      message: 'ACP test requires an agent id. Pick an agent from the list.',
      responseTime: Math.round(performance.now() - startTime),
    }
  }

  // Test cwd: prefer the user's pinned default; otherwise OS tmpdir
  // (we avoid the auto-scratch path here since tests are throwaway and
  // shouldn't litter the per-conversation workspaces folder).
  const cwd = config.acpDefaultCwd || os.tmpdir()

  const provider = createAcpxProvider({
    agent: config.acpAgentId,
    cwd,
    sessionKey: `browseros::test::${config.acpAgentId}::${Date.now()}`,
    permissionMode: config.acpPermissionMode ?? 'approve-reads',
    nonInteractivePermissions: 'deny',
    mcpServers: [
      { type: 'http', name: 'browseros', url: getBrowserOSMcpUrl() },
    ],
    runtime: getSharedAcpRuntime(),
  })

  try {
    await provider.prepare()
    const responseTime = Math.round(performance.now() - startTime)
    return {
      success: true,
      message: `Connected to ${config.acpAgentId} successfully.`,
      responseTime,
    }
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime)
    if (error instanceof AcpxAuthRequiredError) {
      return {
        success: false,
        message: `Authentication required for ${config.acpAgentId}. ${error.message}`,
        responseTime,
      }
    }
    if (error instanceof AcpxAgentNotFoundError) {
      return {
        success: false,
        message: `${config.acpAgentId} CLI not found on this machine. Install it and click Refresh.`,
        responseTime,
      }
    }
    return {
      success: false,
      message: `[${config.acpAgentId}] ${error instanceof Error ? error.message : String(error)}`,
      responseTime,
    }
  } finally {
    // Don't leak a half-spawned child if the test failed — close the
    // provider's sessions; errors here are noise.
    await provider.close().catch(() => {})
  }
}
