import type { FC } from 'react'
import { Badge } from '@/components/ui/badge'
import { displayName } from '../agent-display.helpers'
import type { AgentListItem } from '../agents-page-types'
import type { AgentLiveness } from '../LivenessDot'
import { AgentSparkline } from './AgentSparkline'
import { PinToggle } from './PinToggle'

interface AgentTitleRowProps {
  agent: AgentListItem
  status: AgentLiveness
  pinned: boolean
  turnsByDay: number[]
  failedByDay: number[]
  onPinToggle: (next: boolean) => void
}

export const AgentTitleRow: FC<AgentTitleRowProps> = ({
  agent,
  status,
  pinned,
  turnsByDay,
  failedByDay,
  onPinToggle,
}) => (
  <div className="mb-1 flex items-center gap-2">
    <PinToggle pinned={pinned} onToggle={onPinToggle} />
    <span className="truncate font-semibold">{displayName(agent)}</span>
    {status === 'working' && (
      <Badge
        variant="secondary"
        className="bg-amber-50 text-amber-900 hover:bg-amber-50"
      >
        Working
      </Badge>
    )}
    {status === 'asleep' && (
      <Badge variant="outline" className="text-muted-foreground">
        Asleep
      </Badge>
    )}
    {status === 'error' && <Badge variant="destructive">Attention</Badge>}
    <div className="ml-auto">
      <AgentSparkline turnsByDay={turnsByDay} failedByDay={failedByDay} />
    </div>
  </div>
)
