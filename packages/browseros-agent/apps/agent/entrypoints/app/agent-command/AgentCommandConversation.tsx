import { Home, RotateCcw } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import type { AgentEntry } from '@/entrypoints/app/agents/useOpenClaw'
import { useAgentCommandData } from './agent-command-layout'
import { ConversationInput } from './ConversationInput'
import { ConversationMessage } from './ConversationMessage'
import { useAgentConversation } from './useAgentConversation'

export const AgentCommandConversation: FC = () => {
  const { agentId } = useParams<{ agentId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)

  const { status, agents } = useAgentCommandData()

  const agent = agents.find((a) => a.agentId === agentId)
  const agentName = agent?.name ?? agentId ?? 'Agent'

  const resolvedAgentId = agentId ?? ''
  const { turns, streaming, loading, send, resetConversation } =
    useAgentConversation(resolvedAgentId, agentName)

  // Auto-send query from URL param
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !initialQuerySent.current && !loading) {
      initialQuerySent.current = true
      setSearchParams({}, { replace: true })
      send(q)
    }
  }, [searchParams, loading, send, setSearchParams])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every turns change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [turns])

  const handleSelectAgent = (a: AgentEntry) => {
    navigate(`/home/agents/${a.agentId}`)
  }

  if (!agentId) {
    navigate('/home')
    return null
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-semibold text-sm">{agentName}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={resetConversation}
            title="New conversation"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/home')}
            title="Home"
          >
            <Home className="size-4" />
          </Button>
        </div>
      </div>

      {/* Conversation History */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Loading conversation...
          </div>
        )}
        {!loading && turns.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No messages yet. Send a message to start.
          </div>
        )}
        {turns.map((turn) => (
          <ConversationMessage
            key={turn.id}
            turn={turn}
            streaming={streaming && turn.id === turns[turns.length - 1]?.id}
          />
        ))}
      </div>

      {/* Input */}
      <ConversationInput
        agents={agents}
        selectedAgentId={agentId}
        onSelectAgent={handleSelectAgent}
        onSend={send}
        streaming={streaming}
        disabled={status?.status !== 'running'}
        status={status?.status}
        placeholder="Continue conversation..."
      />
    </div>
  )
}
