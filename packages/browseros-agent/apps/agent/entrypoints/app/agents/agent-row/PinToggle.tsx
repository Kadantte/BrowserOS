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

/**
 * Trailing star toggle. When unpinned and the row isn't hovered the
 * button is removed from layout (`hidden`) so it reserves no space —
 * the title row reads identically whether or not pin is in play.
 * Pinned state keeps the star visible regardless of hover so the
 * "this is pinned" signal is never lost.
 */
export const PinToggle: FC<PinToggleProps> = ({ pinned, onToggle }) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'size-6 text-muted-foreground hover:text-foreground',
            pinned ? 'inline-flex' : 'hidden group-hover:inline-flex',
          )}
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
