import { ArrowRight } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { canChatWithAgent } from '@/entrypoints/app/agents/agent-availability'
import type { AgentEntry } from '@/entrypoints/app/agents/useAgents'
import { ImportDataHint } from '@/entrypoints/newtab/index/ImportDataHint'
import { NewTabBranding } from '@/entrypoints/newtab/index/NewTabBranding'
import { NewTabTip } from '@/entrypoints/newtab/index/NewTabTip'
import { ScheduleResults } from '@/entrypoints/newtab/index/ScheduleResults'
import { SignInHint } from '@/entrypoints/newtab/index/SignInHint'
import { TopSites } from '@/entrypoints/newtab/index/TopSites'
import { useActiveHint } from '@/entrypoints/newtab/index/useActiveHint'
import { AgentCardDock } from './AgentCardDock'
import { useAgentCommandData } from './agent-command-layout'
import { ConversationInput } from './ConversationInput'
import { useAgentCardData } from './useAgentCardData'

function AgentCommandSetupState({
  onOpenAgents,
}: {
  onOpenAgents: () => void
}) {
  return (
    <Card className="border-border/60 bg-card/85 shadow-sm">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="max-w-xl text-muted-foreground text-sm">
          Create BrowserOS agents to turn your new tab into an agent command
          center.
        </p>
        <Button onClick={onOpenAgents} className="gap-2">
          Open Agent Setup
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function OpenClawUnavailableState({
  onOpenAgents,
}: {
  onOpenAgents: () => void
}) {
  return (
    <Card className="border-border/60 bg-card/85 shadow-sm">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="max-w-xl text-muted-foreground text-sm">
          Some OpenClaw agents are unavailable right now. Open the Agents page
          to restart the gateway or review setup.
        </p>
        <Button onClick={onOpenAgents} className="gap-2">
          Open Agent Setup
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

export const AgentCommandHome: FC = () => {
  const navigate = useNavigate()
  const activeHint = useActiveHint()
  const { status, agents, agentsLoading } = useAgentCommandData()
  const [mounted, setMounted] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const cardData = useAgentCardData(agents, status)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (agents.length === 0) {
      if (selectedAgentId) {
        setSelectedAgentId(null)
      }
      return
    }

    const fallbackAgent =
      agents.find((agent) => canChatWithAgent(agent, status)) ?? agents[0]

    if (
      !selectedAgentId ||
      !agents.some((agent) => agent.agentId === selectedAgentId)
    ) {
      setSelectedAgentId(fallbackAgent?.agentId ?? null)
    }
  }, [agents, selectedAgentId, status])

  const handleSend = (text: string) => {
    const selectedAgent = agents.find(
      (agent) => agent.agentId === selectedAgentId,
    )
    if (!selectedAgentId || !canChatWithAgent(selectedAgent, status)) return
    navigate(`/home/agents/${selectedAgentId}?q=${encodeURIComponent(text)}`)
  }

  const handleSelectAgent = (agent: AgentEntry) => {
    setSelectedAgentId(agent.agentId)
  }

  const selectedAgent = agents.find(
    (agent) => agent.agentId === selectedAgentId,
  )
  const canSendToSelectedAgent = canChatWithAgent(selectedAgent, status)
  const hasUnavailableOpenClawAgent = agents.some(
    (agent) =>
      agent.adapterType === 'openclaw' && !canChatWithAgent(agent, status),
  )
  const inputPlaceholder =
    selectedAgent?.adapterType === 'openclaw' && !canSendToSelectedAgent
      ? 'Selected OpenClaw agent is unavailable...'
      : undefined

  return (
    <div className="pt-[max(25vh,16px)]">
      <div className="relative w-full space-y-8 md:w-3xl">
        <NewTabBranding />

        <ConversationInput
          variant="home"
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          onSend={handleSend}
          onCreateAgent={() => navigate('/agents')}
          streaming={false}
          disabled={!canSendToSelectedAgent}
          openClawStatus={status}
          placeholder={inputPlaceholder}
        />

        {mounted ? <NewTabTip /> : null}

        {agentsLoading ? (
          <Card className="border-border/60 bg-card/85 shadow-sm">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              Loading agents...
            </CardContent>
          </Card>
        ) : cardData.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-base">Agents</h2>
                <p className="text-muted-foreground text-sm">
                  Pick up where your agents left off.
                </p>
              </div>
            </div>
            <AgentCardDock
              agents={cardData}
              activeAgentId={selectedAgentId ?? undefined}
              onSelectAgent={(agentId) => navigate(`/home/agents/${agentId}`)}
              onCreateAgent={() => navigate('/agents')}
            />
            {hasUnavailableOpenClawAgent ? (
              <OpenClawUnavailableState
                onOpenAgents={() => navigate('/agents')}
              />
            ) : null}
          </section>
        ) : (
          <AgentCommandSetupState onOpenAgents={() => navigate('/agents')} />
        )}

        {mounted ? <TopSites /> : null}
        {mounted ? <ScheduleResults /> : null}
      </div>

      {activeHint === 'signin' ? <SignInHint /> : null}
      {activeHint === 'import' ? <ImportDataHint /> : null}
    </div>
  )
}
