import { Bot } from 'lucide-react'
import type { FC } from 'react'
import type { AgentCardData } from '@/lib/agent-conversations/types'
import { cn } from '@/lib/utils'

interface AgentCardProps {
  agent: AgentCardData
  onClick: () => void
  active?: boolean
}

function statusDotClass(status: AgentCardData['status']) {
  if (status === 'working') return 'bg-amber-500 animate-pulse'
  if (status === 'error') return 'bg-destructive'
  return 'bg-emerald-500'
}

function formatTimestamp(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export const AgentCardExpanded: FC<AgentCardProps> = ({
  agent,
  onClick,
  active,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex w-48 shrink-0 flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:shadow-md',
      active
        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)]/5'
        : 'border-border bg-card hover:border-[var(--accent-orange)]/50',
    )}
  >
    <div className="flex items-center justify-between">
      <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]">
        <Bot className="size-4" />
      </div>
      <span
        className={cn('size-2 rounded-full', statusDotClass(agent.status))}
      />
    </div>
    <div className="font-medium text-sm">{agent.name}</div>
    {agent.lastMessage ? (
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-muted-foreground text-xs">
          {agent.lastMessage}
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatTimestamp(agent.lastMessageTimestamp)}
        </span>
      </div>
    ) : (
      <span className="text-muted-foreground text-xs">
        No conversations yet
      </span>
    )}
    {agent.model && (
      <span className="text-muted-foreground/60 text-xs">{agent.model}</span>
    )}
  </button>
)

export const AgentCardCompact: FC<AgentCardProps> = ({
  agent,
  onClick,
  active,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-3 py-1.5 text-sm transition-all',
      active
        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
        : 'border-border bg-card text-foreground hover:border-[var(--accent-orange)]/50',
    )}
  >
    {agent.name}
  </button>
)
