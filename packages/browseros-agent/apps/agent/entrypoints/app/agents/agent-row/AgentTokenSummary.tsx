import type { FC } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Progress } from '@/components/ui/progress'
import { formatTokens } from './agent-row.helpers'
import type { AgentTokenUsage } from './agent-row.types'

interface AgentTokenSummaryProps {
  tokens: AgentTokenUsage | null
}

export const AgentTokenSummary: FC<AgentTokenSummaryProps> = ({ tokens }) => {
  if (!tokens) return null
  const { input, output } = tokens.last7d
  const total = input + output
  if (total === 0) return null

  const inputPct = total > 0 ? (input / total) * 100 : 0
  const lifetimeTotal = tokens.cumulative.input + tokens.cumulative.output

  return (
    <HoverCard openDelay={250}>
      <HoverCardTrigger asChild>
        <span className="cursor-default text-muted-foreground">
          {formatTokens(total)} tokens
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-72 text-sm">
        <div className="mb-3 font-medium">Tokens (last 7 days)</div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Input</span>
            <span>{formatTokens(input)}</span>
          </div>
          <Progress value={inputPct} className="h-1.5" />

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Output</span>
            <span>{formatTokens(output)}</span>
          </div>
          <Progress value={100 - inputPct} className="h-1.5" />
        </div>

        <div className="mt-3 border-t pt-2 text-muted-foreground text-xs">
          Total <span className="text-foreground">{formatTokens(total)}</span>
          {' · '}
          across {tokens.last7d.requestCount} requests
        </div>
        <div className="mt-1 text-muted-foreground text-xs">
          Lifetime{' '}
          <span className="text-foreground">{formatTokens(lifetimeTotal)}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
