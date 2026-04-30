import { Star } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface PinToggleProps {
  pinned: boolean
  onToggle: (next: boolean) => void
}

export const PinToggle: FC<PinToggleProps> = ({ pinned, onToggle }) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          aria-pressed={pinned}
          aria-label={pinned ? 'Unpin agent' : 'Pin agent'}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(!pinned)
          }}
        >
          <Star
            className={cn(
              'size-3.5',
              pinned && 'fill-amber-400 text-amber-500',
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {pinned ? 'Unpin' : 'Pin to top'}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)
