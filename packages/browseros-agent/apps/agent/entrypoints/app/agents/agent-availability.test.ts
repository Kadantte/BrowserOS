import { describe, expect, it } from 'bun:test'
import { canChatWithAgent, isOpenClawAgentReady } from './agent-availability'
import type { AgentEntry } from './useAgents'

describe('agent-availability', () => {
  it('treats only a connected running OpenClaw runtime as ready', () => {
    expect(
      isOpenClawAgentReady({
        status: 'running',
        controlPlaneStatus: 'connected',
      } as never),
    ).toBe(true)

    expect(
      isOpenClawAgentReady({
        status: 'running',
        controlPlaneStatus: 'disconnected',
      } as never),
    ).toBe(false)
  })

  it('allows local agents even when OpenClaw is unavailable', () => {
    const localAgent: AgentEntry = {
      agentId: 'codex-agent',
      name: 'Codex Agent',
      workspace: '/tmp/codex-agent',
      adapterType: 'codex_local',
    }
    const openClawAgent: AgentEntry = {
      agentId: 'main',
      name: 'Main',
      workspace: '/home/node/.openclaw/workspace',
      adapterType: 'openclaw',
    }

    expect(canChatWithAgent(localAgent, null)).toBe(true)
    expect(
      canChatWithAgent(openClawAgent, {
        status: 'stopped',
        controlPlaneStatus: 'disconnected',
      } as never),
    ).toBe(false)
  })
})
