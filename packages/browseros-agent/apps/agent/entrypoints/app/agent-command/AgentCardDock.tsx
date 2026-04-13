import { Plus } from 'lucide-react'
import type { FC } from 'react'
import type { AgentCardData } from '@/lib/agent-conversations/types'
import { cn } from '@/lib/utils'
import { AgentCardCompact, AgentCardExpanded } from './AgentCard'

interface AgentCardDockProps {
  agents: AgentCardData[]
  activeAgentId?: string
  onSelectAgent: (agentId: string) => void
  onCreateAgent?: () => void
  compact?: boolean
}

export const AgentCardDock: FC<AgentCardDockProps> = ({
  agents,
  activeAgentId,
  onSelectAgent,
  onCreateAgent,
  compact,
}) => {
  if (agents.length === 0 && !onCreateAgent) return null

  const Card = compact ? AgentCardCompact : AgentCardExpanded

  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto px-4 py-3',
        compact ? 'items-center justify-center' : 'snap-x snap-mandatory',
      )}
    >
      {agents.map((agent) => (
        <div key={agent.agentId} className={compact ? '' : 'snap-start'}>
          <Card
            agent={agent}
            active={agent.agentId === activeAgentId}
            onClick={() => onSelectAgent(agent.agentId)}
          />
        </div>
      ))}
      {onCreateAgent && (
        <button
          type="button"
          onClick={onCreateAgent}
          className={cn(
            'flex shrink-0 items-center justify-center gap-1 border border-dashed text-muted-foreground transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)]',
            compact
              ? 'rounded-full px-3 py-1.5 text-sm'
              : 'w-48 rounded-xl p-4',
          )}
        >
          <Plus className={compact ? 'size-3.5' : 'size-5'} />
          {!compact && <span className="text-sm">New Agent</span>}
        </button>
      )}
    </div>
  )
}
