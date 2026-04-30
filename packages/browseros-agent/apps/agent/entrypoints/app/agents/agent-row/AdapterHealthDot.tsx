import type { FC } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'
import { adapterLabel } from '../AdapterIcon'
import type { HarnessAgentAdapter } from '../agent-harness-types'
import type { AgentAdapterHealth } from './agent-row.types'

interface AdapterHealthDotProps {
  adapter: HarnessAgentAdapter | 'unknown'
  health: AgentAdapterHealth
  className?: string
}

export const AdapterHealthDot: FC<AdapterHealthDotProps> = ({
  adapter,
  health,
  className,
}) => (
  <HoverCard openDelay={250}>
    <HoverCardTrigger asChild>
      <span
        role="img"
        aria-label={
          health.healthy
            ? `${adapterLabel(adapter)} adapter healthy`
            : `${adapterLabel(adapter)} adapter unavailable`
        }
        className={cn(
          'block size-2 rounded-full ring-2 ring-card',
          health.healthy ? 'bg-emerald-500' : 'bg-destructive',
          className,
        )}
      />
    </HoverCardTrigger>
    <HoverCardContent side="right" className="w-72 text-sm">
      <div className="font-medium">{adapterLabel(adapter)} CLI</div>
      <div className="mt-1 text-muted-foreground text-xs">
        {health.healthy
          ? 'Healthy and resolvable on $PATH.'
          : (health.reason ?? 'Adapter is unavailable.')}
      </div>
    </HoverCardContent>
  </HoverCard>
)
