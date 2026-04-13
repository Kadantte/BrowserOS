import { ArrowRight } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  type AgentEntry,
  getModelDisplayName,
} from '@/entrypoints/app/agents/useOpenClaw'
import { NewTabBranding } from '@/entrypoints/newtab/index/NewTabBranding'
import { getLatestConversation } from '@/lib/agent-conversations/storage'
import type { AgentCardData } from '@/lib/agent-conversations/types'
import { AgentCardDock } from './AgentCardDock'
import { useAgentCommandData } from './agent-command-layout'
import { ConversationInput } from './ConversationInput'

export const AgentCommandHome: FC = () => {
  const navigate = useNavigate()
  const { status, agents } = useAgentCommandData()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [cardData, setCardData] = useState<AgentCardData[]>([])

  // Auto-select first agent
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].agentId)
    }
  }, [agents, selectedAgentId])

  // Build card data with last message from storage
  useEffect(() => {
    async function loadCardData() {
      const data = await Promise.all(
        agents.map(async (agent) => {
          const conv = await getLatestConversation(agent.agentId)
          const lastTurn = conv?.turns[conv.turns.length - 1]
          const lastTextPart = lastTurn?.parts.findLast(
            (p) => p.kind === 'text',
          )
          return {
            agentId: agent.agentId,
            name: agent.name,
            model: getModelDisplayName(agent.model),
            status:
              status?.status === 'running'
                ? ('idle' as const)
                : status?.status === 'error'
                  ? ('error' as const)
                  : ('idle' as const),
            lastMessage:
              lastTextPart?.kind === 'text'
                ? lastTextPart.text.slice(0, 80)
                : undefined,
            lastMessageTimestamp: lastTurn?.timestamp,
          }
        }),
      )
      setCardData(data)
    }
    if (agents.length > 0) loadCardData()
  }, [agents, status?.status])

  const handleSend = (text: string) => {
    if (!selectedAgentId) return
    navigate(`/home/agents/${selectedAgentId}?q=${encodeURIComponent(text)}`)
  }

  const handleSelectAgent = (agent: AgentEntry) => {
    setSelectedAgentId(agent.agentId)
  }

  const handleCardClick = (agentId: string) => {
    navigate(`/home/agents/${agentId}`)
  }

  const isSetup = status?.status && status.status !== 'uninitialized'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
      <NewTabBranding />

      <div className="w-full max-w-2xl">
        <ConversationInput
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          onSend={handleSend}
          streaming={false}
          disabled={status?.status !== 'running'}
          status={status?.status}
          placeholder={
            status?.status === 'running'
              ? undefined
              : 'OpenClaw is not running...'
          }
        />
      </div>

      {isSetup && cardData.length > 0 && (
        <div className="w-full max-w-3xl">
          <AgentCardDock
            agents={cardData}
            activeAgentId={selectedAgentId ?? undefined}
            onSelectAgent={handleCardClick}
            onCreateAgent={() => navigate('/agents')}
          />
        </div>
      )}

      {!isSetup && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-muted-foreground text-sm">
            Set up AI agents to automate browser tasks
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/agents')}
            className="gap-2"
          >
            Get Started
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
