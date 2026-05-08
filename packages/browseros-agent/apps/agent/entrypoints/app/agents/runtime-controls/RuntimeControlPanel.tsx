import {
  Download,
  Loader2,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type RuntimeAction,
  type RuntimeAdapterId,
  useRuntime,
  useRuntimeAction,
} from '../useRuntime'

interface RuntimeControlPanelProps {
  adapter: RuntimeAdapterId
  /** Optional — adapter-specific extras rendered below the primary CTA (e.g. openclaw provider config dialog trigger). */
  extras?: ReactNode
}

/**
 * State-appropriate primary CTAs for a runtime, gated on capabilities.
 * Container runtimes get install/start/stop/restart; host-process
 * runtimes get reinstall-cli/check-auth.
 */
export const RuntimeControlPanel: FC<RuntimeControlPanelProps> = ({
  adapter,
  extras,
}) => {
  const { data, isLoading } = useRuntime(adapter)
  const action = useRuntimeAction(adapter)
  if (isLoading || !data) return null

  const { state } = data.status
  const caps = new Set(data.capabilities)
  const acting = action.isPending
  const dispatch = (a: RuntimeAction) => action.mutate({ action: a })

  // Container-runtime states first (most adapters today).
  if (state === 'not_installed' && caps.has('install'))
    return (
      <PanelCard
        title={`${data.descriptor.displayName} not installed`}
        description="Pull the container image to get started. The image runs inside the bundled BrowserOS VM and stays put across restarts."
      >
        <Primary
          icon={<Download className="mr-1.5 h-3.5 w-3.5" />}
          label="Install"
          onClick={() => dispatch('install')}
          acting={acting}
        />
        {extras}
      </PanelCard>
    )

  if ((state === 'stopped' || state === 'installed') && caps.has('start'))
    return (
      <PanelCard
        title={`${data.descriptor.displayName} is ${state === 'installed' ? 'ready to start' : 'stopped'}`}
        description={
          state === 'installed'
            ? 'Image is pulled. Start the container to use this adapter.'
            : 'Start the container to use this adapter.'
        }
      >
        <Primary
          icon={<Play className="mr-1.5 h-3.5 w-3.5" />}
          label="Start"
          onClick={() => dispatch('start')}
          acting={acting}
        />
        {extras}
      </PanelCard>
    )

  if (state === 'errored')
    return (
      <PanelCard
        tone="destructive"
        title={`${data.descriptor.displayName} hit an error`}
        description={
          data.status.lastError ??
          'Restart usually clears it. Reset wipes container state.'
        }
      >
        {caps.has('restart') && (
          <Primary
            icon={<RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
            label="Restart"
            onClick={() => dispatch('restart')}
            acting={acting}
          />
        )}
        {caps.has('reset-soft') && (
          <Button
            variant="outline"
            size="sm"
            disabled={acting}
            onClick={() => dispatch('reset-soft')}
          >
            <TriangleAlert className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
        {extras}
      </PanelCard>
    )

  if (state === 'installing' || state === 'starting')
    return (
      <PanelCard
        title={`${data.descriptor.displayName} is ${state === 'installing' ? 'installing' : 'starting'}…`}
        description="This usually takes a few seconds."
      >
        <Button variant="ghost" size="sm" disabled>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Working…
        </Button>
        {extras}
      </PanelCard>
    )

  // Host-process runtime states.
  if (state === 'cli_missing' && caps.has('reinstall-cli'))
    return (
      <PanelCard
        tone="muted"
        title={`${data.descriptor.displayName} CLI not installed`}
        description="Install the CLI on your $PATH to use this adapter."
      >
        <Primary
          icon={<Download className="mr-1.5 h-3.5 w-3.5" />}
          label="Reinstall CLI"
          onClick={() => dispatch('reinstall-cli')}
          acting={acting}
        />
        {extras}
      </PanelCard>
    )

  if (state === 'cli_unhealthy' && caps.has('reinstall-cli'))
    return (
      <PanelCard
        tone="destructive"
        title={`${data.descriptor.displayName} CLI is unhealthy`}
        description={data.status.lastError ?? 'Reinstall to recover.'}
      >
        <Primary
          icon={<Download className="mr-1.5 h-3.5 w-3.5" />}
          label="Reinstall CLI"
          onClick={() => dispatch('reinstall-cli')}
          acting={acting}
        />
        {extras}
      </PanelCard>
    )

  // No CTA needed when running / cli_present — the StatusBar shows
  // the running pill. Optional Stop appears in the status-bar slot.
  if (state === 'running' && caps.has('stop'))
    return extras ? (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={acting}
          onClick={() => dispatch('stop')}
        >
          <Square className="mr-1.5 h-3.5 w-3.5" />
          Stop
        </Button>
        {extras}
      </div>
    ) : null

  return null
}

interface PrimaryProps {
  icon: ReactNode
  label: string
  onClick: () => void
  acting: boolean
}

const Primary: FC<PrimaryProps> = ({ icon, label, onClick, acting }) => (
  <Button onClick={onClick} disabled={acting} size="sm">
    {acting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : icon}
    {label}
  </Button>
)

interface PanelCardProps {
  title: string
  description?: string
  tone?: 'default' | 'destructive' | 'muted'
  children: ReactNode
}

const PanelCard: FC<PanelCardProps> = ({
  title,
  description,
  tone = 'default',
  children,
}) => (
  <Card
    className={
      tone === 'destructive'
        ? 'border-destructive/40 bg-destructive/5'
        : tone === 'muted'
          ? 'bg-muted/30'
          : undefined
    }
  >
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">{title}</CardTitle>
      {description && (
        <CardDescription className="text-xs">{description}</CardDescription>
      )}
    </CardHeader>
    <CardContent className="flex flex-wrap items-center gap-2 pt-0">
      {children}
    </CardContent>
  </Card>
)
