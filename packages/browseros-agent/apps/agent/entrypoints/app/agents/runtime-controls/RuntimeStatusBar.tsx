import { Loader2, RotateCcw } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  type RuntimeAdapterId,
  useRuntime,
  useRuntimeAction,
} from '../useRuntime'

interface RuntimeStatusBarProps {
  adapter: RuntimeAdapterId
  /** Optional — render an adapter-specific extra pill (e.g. control-plane status for openclaw). */
  extraPill?: ReactNode
  /** Optional — slot rendered after the restart button (e.g. "Open Terminal" for openclaw). */
  extraActions?: ReactNode
}

export const RuntimeStatusBar: FC<RuntimeStatusBarProps> = ({
  adapter,
  extraPill,
  extraActions,
}) => {
  const { data, isLoading } = useRuntime(adapter)
  const restart = useRuntimeAction(adapter)

  if (isLoading || !data) return null

  const pill = pillForState(data.status.state)
  const canRestart = data.capabilities.includes('restart')
  const acting = restart.isPending

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-muted-foreground">
          {data.descriptor.displayName}
        </span>
        <Badge variant={pill.variant} className={cn('gap-1.5', pill.className)}>
          <span
            className={cn('inline-block h-1.5 w-1.5 rounded-full', pill.dot)}
          />
          {pill.label}
        </Badge>
        {extraPill}
        {(canRestart || extraActions) && (
          <Separator orientation="vertical" className="h-4" />
        )}
        {extraActions}
        {canRestart && (
          <WithTooltip label={`Restart ${data.descriptor.displayName}.`}>
            <Button
              variant="ghost"
              size="sm"
              disabled={acting}
              onClick={() => restart.mutate({ action: 'restart' })}
              className="ml-auto"
            >
              {acting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Restart
            </Button>
          </WithTooltip>
        )}
      </div>
      {data.status.lastError && data.status.state === 'errored' && (
        <p className="mt-2 text-destructive text-xs">{data.status.lastError}</p>
      )}
    </div>
  )
}

const WithTooltip: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <TooltipProvider delayDuration={250}>
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

interface PillKind {
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  label: string
  dot: string
  className?: string
}

function pillForState(state: string): PillKind {
  switch (state) {
    case 'running':
    case 'cli_present':
      return {
        variant: 'secondary',
        label: state === 'cli_present' ? 'Available' : 'Running',
        dot: 'bg-emerald-500',
        className: 'bg-emerald-50 text-emerald-900 hover:bg-emerald-50',
      }
    case 'starting':
    case 'installing':
      return {
        variant: 'secondary',
        label: state === 'installing' ? 'Installing' : 'Starting',
        dot: 'bg-amber-500 animate-pulse',
        className: 'bg-amber-50 text-amber-900 hover:bg-amber-50',
      }
    case 'installed':
    case 'stopped':
      return {
        variant: 'outline',
        label: state === 'installed' ? 'Installed' : 'Stopped',
        dot: 'bg-muted-foreground/40',
      }
    case 'cli_missing':
      return {
        variant: 'outline',
        label: 'CLI not installed',
        dot: 'bg-amber-500',
        className: 'border-amber-500/40 bg-amber-50 text-amber-900',
      }
    case 'cli_unhealthy':
      return {
        variant: 'destructive',
        label: 'CLI unhealthy',
        dot: 'bg-destructive-foreground',
      }
    case 'errored':
      return {
        variant: 'destructive',
        label: 'Errored',
        dot: 'bg-destructive-foreground',
      }
    case 'unsupported_platform':
      return {
        variant: 'outline',
        label: 'Unsupported platform',
        dot: 'bg-muted-foreground/40',
      }
    case 'not_installed':
      return {
        variant: 'outline',
        label: 'Not installed',
        dot: 'bg-muted-foreground/40',
      }
    default:
      return {
        variant: 'outline',
        label: state,
        dot: 'bg-muted-foreground/40',
      }
  }
}
