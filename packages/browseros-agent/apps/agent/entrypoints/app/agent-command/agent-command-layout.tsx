import type { FC } from 'react'
import { Outlet, useOutletContext } from 'react-router'
import { useHarnessAgents } from '@/entrypoints/app/agents/useAgents'
import type { AgentEntry } from '@/entrypoints/app/agents/useOpenClaw'
import { useOpenClawAgents } from '@/entrypoints/app/agents/useOpenClaw'
import { useRuntime } from '@/entrypoints/app/agents/useRuntime'

interface AgentCommandContextValue {
  agents: AgentEntry[]
  agentsLoading: boolean
  openClawReady: boolean
  openClawReadyLoading: boolean
}

export const AgentCommandLayout: FC = () => {
  const { data: runtime, isLoading: runtimeLoading } = useRuntime('openclaw')
  const openClawReady = runtime?.status.state === 'running'
  const { agents: openClawAgents, loading: openClawAgentsLoading } =
    useOpenClawAgents(openClawReady)
  const { agents: harnessAgents, loading: harnessAgentsLoading } =
    useHarnessAgents()
  const visibleOpenClawAgents = openClawReady ? openClawAgents : []
  // Dual-created OpenClaw agents appear in both `/claw/agents` (gateway
  // record) and `/agents` (harness record) under the same id. Prefer the
  // harness entry so the chat panel can route through the harness path
  // and the rail doesn't show duplicates.
  const harnessAgentIds = new Set(harnessAgents.map((entry) => entry.agentId))
  const dedupedOpenClawAgents = visibleOpenClawAgents.filter(
    (entry) => !harnessAgentIds.has(entry.agentId),
  )
  const agents = [...dedupedOpenClawAgents, ...harnessAgents]

  return (
    <Outlet
      context={
        {
          agents,
          agentsLoading:
            harnessAgentsLoading ||
            runtimeLoading ||
            (openClawReady && openClawAgentsLoading),
          openClawReady,
          openClawReadyLoading: runtimeLoading,
        } satisfies AgentCommandContextValue
      }
    />
  )
}

export function useAgentCommandData(): AgentCommandContextValue {
  return useOutletContext<AgentCommandContextValue>()
}
