import type { FC, ReactNode } from 'react'
import {
  type RuntimeAdapterId,
  type RuntimeView,
  useRuntimes,
} from '../useRuntime'
import { RuntimeControlPanel } from './RuntimeControlPanel'
import { RuntimeStatusBar } from './RuntimeStatusBar'

/** Optional adapter-specific UI hooks. Each runtime can plug in extras
 *  for the control panel (e.g. openclaw's "Configure provider…") and
 *  the status bar (extraPill, extraActions). Missing keys fall back to
 *  the generic panel/bar with no extras. */
export interface RuntimeAdapterExtras {
  panelExtras?: ReactNode
  statusBarExtraPill?: ReactNode
  statusBarExtraActions?: ReactNode
}

interface RuntimesSectionProps {
  /** Per-adapter customization keyed by adapterId. Adapters not in the
   *  map render the generic UI. */
  extras?: Partial<Record<RuntimeAdapterId, RuntimeAdapterExtras>>
}

/** Renders one card per container-kind runtime (openclaw, hermes, …)
 *  with state-appropriate Install / Start / Restart controls and a
 *  status bar. Adapter-specific affordances slot in via `extras`. */
export const RuntimesSection: FC<RuntimesSectionProps> = ({ extras }) => {
  const { data, isLoading } = useRuntimes()
  if (isLoading || !data) return null

  const containerRuntimes = data.filter(
    (r) => r.descriptor.kind === 'container',
  )
  if (containerRuntimes.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {containerRuntimes.map((runtime) => (
        <RuntimeCard
          key={runtime.descriptor.adapterId}
          runtime={runtime}
          extras={extras?.[runtime.descriptor.adapterId as RuntimeAdapterId]}
        />
      ))}
    </div>
  )
}

interface RuntimeCardProps {
  runtime: RuntimeView
  extras?: RuntimeAdapterExtras
}

const RuntimeCard: FC<RuntimeCardProps> = ({ runtime, extras }) => {
  const adapter = runtime.descriptor.adapterId as RuntimeAdapterId
  const showStatusBar = runtime.status.state === 'running'

  return (
    <div className="flex flex-col gap-3">
      <RuntimeControlPanel adapter={adapter} extras={extras?.panelExtras} />
      {showStatusBar && (
        <RuntimeStatusBar
          adapter={adapter}
          extraPill={extras?.statusBarExtraPill}
          extraActions={extras?.statusBarExtraActions}
        />
      )}
    </div>
  )
}
