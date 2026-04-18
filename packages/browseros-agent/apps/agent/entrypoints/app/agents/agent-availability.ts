import type { AgentEntry } from './useAgents'
import type { OpenClawStatus } from './useOpenClaw'

export function isOpenClawAgentReady(
  status: Pick<OpenClawStatus, 'status' | 'controlPlaneStatus'> | null,
): boolean {
  return (
    status?.status === 'running' && status.controlPlaneStatus === 'connected'
  )
}

export function canChatWithAgent(
  agent: Pick<AgentEntry, 'adapterType'> | null | undefined,
  openClawStatus: Pick<OpenClawStatus, 'status' | 'controlPlaneStatus'> | null,
): boolean {
  if (!agent) {
    return false
  }
  if (agent.adapterType !== 'openclaw') {
    return true
  }
  return isOpenClawAgentReady(openClawStatus)
}
