import type { FC } from 'react'
import { adapterLabel } from '../AdapterIcon'
import type { HarnessAgentAdapter } from '../agent-harness-types'

interface AgentSummaryChipsProps {
  adapter: HarnessAgentAdapter | 'unknown'
  modelLabel: string | null
  reasoningEffort: string | null
}

/**
 * Adapter / model / reasoning summary line. Always rendered (even when
 * the model/reasoning fall back to defaults) so OpenClaw rows — which
 * frequently show `default`/`medium` — still expose what they're set
 * up to do.
 */
export const AgentSummaryChips: FC<AgentSummaryChipsProps> = ({
  adapter,
  modelLabel,
  reasoningEffort,
}) => {
  const parts = [adapterLabel(adapter)]
  if (modelLabel) parts.push(modelLabel)
  if (reasoningEffort) parts.push(reasoningEffort)
  return (
    <div className="text-muted-foreground text-xs">{parts.join(' · ')}</div>
  )
}
