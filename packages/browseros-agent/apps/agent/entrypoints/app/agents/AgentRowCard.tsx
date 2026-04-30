import type { FC } from 'react'
import { cn } from '@/lib/utils'
import { AgentActions } from './agent-row/AgentActions'
import { AgentErrorPanel } from './agent-row/AgentErrorPanel'
import { AgentLastMessage } from './agent-row/AgentLastMessage'
import { AgentMetaRow } from './agent-row/AgentMetaRow'
import { AgentSummaryChips } from './agent-row/AgentSummaryChips'
import { AgentTile } from './agent-row/AgentTile'
import { AgentTitleRow } from './agent-row/AgentTitleRow'
import type {
  AgentRowCallbacks,
  AgentRowData,
} from './agent-row/agent-row.types'

interface AgentRowCardProps extends AgentRowCallbacks {
  data: AgentRowData
  /** Whether THIS agent is mid-delete; renders a spinner in the menu. */
  deleting?: boolean
}

/**
 * Composition shell for the agent rail. Owns no state — every
 * sub-component handles its own micro-state (error-panel collapse,
 * cwd-copy flash, hover-cards) and emits callbacks for things the
 * page must know about (delete, pin/unpin).
 */
export const AgentRowCard: FC<AgentRowCardProps> = ({
  data,
  deleting,
  onDelete,
  onPinToggle,
}) => {
  return (
    <div
      className={cn(
        'group rounded-xl border border-border bg-card p-4 shadow-sm transition-all',
        'hover:border-[var(--accent-orange)]/50 hover:shadow-sm',
        data.status === 'error' && 'border-destructive/40',
      )}
    >
      <div className="flex items-start gap-4">
        <AgentTile
          adapter={data.adapter}
          status={data.status}
          lastUsedAt={data.lastUsedAt}
          adapterHealth={data.adapterHealth}
        />

        <div className="min-w-0 flex-1">
          <AgentTitleRow
            agent={data.agent}
            status={data.status}
            pinned={data.pinned}
            turnsByDay={data.turnsByDay}
            failedByDay={data.failedByDay}
            onPinToggle={(next) => onPinToggle(data.agent, next)}
          />

          <AgentSummaryChips
            adapter={data.adapter}
            modelLabel={data.modelLabel}
            reasoningEffort={data.reasoningEffort}
          />

          <AgentLastMessage
            agentId={data.agent.agentId}
            message={data.lastUserMessage}
          />

          <AgentMetaRow
            lastUsedAt={data.lastUsedAt}
            cwd={data.cwd}
            turnsLast7d={data.tokens?.last7d.requestCount ?? 0}
            tokens={data.tokens}
          />

          {data.status === 'error' && data.lastError && (
            <AgentErrorPanel
              agentId={data.agent.agentId}
              message={data.lastError}
              errorAt={data.lastErrorAt}
            />
          )}
        </div>

        <AgentActions
          agent={data.agent}
          activeTurnId={data.activeTurnId}
          deleting={deleting}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}
