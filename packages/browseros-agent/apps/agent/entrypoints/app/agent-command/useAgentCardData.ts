import { useEffect, useState } from 'react'
import { isOpenClawAgentReady } from '@/entrypoints/app/agents/agent-availability'
import type { AgentEntry } from '@/entrypoints/app/agents/useAgents'
import {
  getModelDisplayName,
  type OpenClawStatus,
} from '@/entrypoints/app/agents/useOpenClaw'
import { getLatestConversation } from '@/lib/agent-conversations/storage'
import type { AgentCardData } from '@/lib/agent-conversations/types'

function getAgentStatusTone(
  agent: AgentEntry,
  status: OpenClawStatus | null,
): AgentCardData['status'] {
  if (agent.adapterType !== 'openclaw') {
    return 'idle'
  }
  if (status?.status === 'error' || status?.controlPlaneStatus === 'failed') {
    return 'error'
  }
  if (
    status?.status === 'starting' ||
    status?.controlPlaneStatus === 'connecting' ||
    status?.controlPlaneStatus === 'reconnecting' ||
    status?.controlPlaneStatus === 'recovering'
  ) {
    return 'working'
  }
  if (!isOpenClawAgentReady(status)) {
    return 'error'
  }
  return 'idle'
}

async function getAgentCardData(
  agent: AgentEntry,
  status: OpenClawStatus | null,
): Promise<AgentCardData> {
  const conversation = await getLatestConversation(agent.agentId)
  const lastTurn = conversation?.turns[conversation.turns.length - 1]
  const lastTextPart = lastTurn?.parts.findLast((part) => part.kind === 'text')

  return {
    agentId: agent.agentId,
    name: agent.name,
    model:
      getModelDisplayName(agent.model) ??
      (agent.adapterType === 'codex_local'
        ? 'Codex local'
        : agent.adapterType === 'claude_local'
          ? 'Claude local'
          : 'OpenClaw'),
    status: getAgentStatusTone(agent, status),
    lastMessage:
      lastTextPart?.kind === 'text'
        ? lastTextPart.text.slice(0, 120)
        : undefined,
    lastMessageTimestamp: lastTurn?.timestamp,
  }
}

export function useAgentCardData(
  agents: AgentEntry[],
  status: OpenClawStatus | null,
) {
  const [cardData, setCardData] = useState<AgentCardData[]>([])

  useEffect(() => {
    let active = true

    const loadCardData = async () => {
      const nextCardData = await Promise.all(
        agents.map((agent) => getAgentCardData(agent, status)),
      )
      if (active) {
        setCardData(nextCardData)
      }
    }

    if (agents.length > 0) {
      void loadCardData()
    } else {
      setCardData([])
    }

    return () => {
      active = false
    }
  }, [agents, status])

  return cardData
}
