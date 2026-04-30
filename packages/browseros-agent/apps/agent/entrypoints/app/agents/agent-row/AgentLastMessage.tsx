import { Quote } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { firstNonBlankLine, truncate } from './agent-row.helpers'

interface AgentLastMessageProps {
  agentId: string
  message: string | null
}

const PREVIEW_CHARS = 100
const FULL_CHARS = 1200

export const AgentLastMessage: FC<AgentLastMessageProps> = ({
  agentId,
  message,
}) => {
  const navigate = useNavigate()

  if (!message) {
    return (
      <p className="mt-1 text-muted-foreground text-xs italic">
        (start a chat to see message previews here)
      </p>
    )
  }

  const preview = truncate(firstNonBlankLine(message), PREVIEW_CHARS)
  const full = truncate(message.trim(), FULL_CHARS)

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <p className="mt-1 flex cursor-default items-start gap-1.5 text-foreground/80 text-sm">
          <Quote className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{preview}</span>
        </p>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" className="w-96 text-sm">
        <div className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Last user message
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{full}</p>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/agents/${agentId}`)}
          >
            Continue this →
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
