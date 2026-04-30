import type { FC } from 'react'
import { cn } from '@/lib/utils'
import { AdapterIcon } from '../AdapterIcon'
import { livenessDetail } from '../agent-display.helpers'
import type { HarnessAgentAdapter } from '../agent-harness-types'
import { type AgentLiveness, LivenessDot } from '../LivenessDot'
import { AdapterHealthDot } from './AdapterHealthDot'
import type { AgentAdapterHealth } from './agent-row.types'

export interface AgentTileProps {
  adapter: HarnessAgentAdapter | 'unknown'
  status: AgentLiveness
  lastUsedAt: number | null
  adapterHealth: AgentAdapterHealth | null
}

export const AgentTile: FC<AgentTileProps> = ({
  adapter,
  status,
  lastUsedAt,
  adapterHealth,
}) => (
  <div className="relative shrink-0">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <AdapterIcon adapter={adapter} className="h-6 w-6" />
    </div>
    {adapterHealth && (
      <AdapterHealthDot
        adapter={adapter}
        health={adapterHealth}
        className="absolute -top-0.5 -right-0.5"
      />
    )}
    <LivenessDot
      status={status}
      detail={livenessDetail(status, lastUsedAt)}
      className={cn(
        'absolute -right-0.5 -bottom-0.5',
        status === 'working' && 'animate-pulse',
      )}
    />
  </div>
)
