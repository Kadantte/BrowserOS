import type { FC } from 'react'
import { formatRelativeTime } from '../agent-display.helpers'
import { AgentTokenSummary } from './AgentTokenSummary'
import type { AgentTokenUsage } from './agent-row.types'
import { CwdChip } from './CwdChip'

interface AgentMetaRowProps {
  lastUsedAt: number | null
  cwd: string | null
  /** Turn count over the last 7 days. 0 hides the stats segment. */
  turnsLast7d: number
  tokens: AgentTokenUsage | null
}

export const AgentMetaRow: FC<AgentMetaRowProps> = ({
  lastUsedAt,
  cwd,
  turnsLast7d,
  tokens,
}) => {
  const lastUsedLabel = formatRelativeTime(lastUsedAt)
  const showStats = turnsLast7d > 0
  const tokensTotal = (tokens?.last7d.input ?? 0) + (tokens?.last7d.output ?? 0)
  const showTokens = showStats && tokensTotal > 0

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
      <span>{lastUsedLabel}</span>
      {cwd && (
        <>
          <span aria-hidden>•</span>
          <CwdChip cwd={cwd} />
        </>
      )}
      {showStats && (
        <>
          <span aria-hidden>•</span>
          <span className="font-medium text-foreground/80">7d stats:</span>
          <span>
            {turnsLast7d} {turnsLast7d === 1 ? 'turn' : 'turns'}
            {showTokens ? ',' : ''}
          </span>
          {showTokens && <AgentTokenSummary tokens={tokens} />}
        </>
      )}
    </div>
  )
}
