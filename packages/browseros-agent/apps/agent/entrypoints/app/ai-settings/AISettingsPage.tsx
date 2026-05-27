import type { FC, ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { AdapterIcon, adapterLabel } from '@/entrypoints/app/agents/AdapterIcon'
import type { HarnessAgentAdapter } from '@/entrypoints/app/agents/agent-harness-types'
import { useAgentAdapters } from '@/entrypoints/app/agents/useAgents'
import { visibleAdapters } from '@/lib/chat/adapter-visibility'
import { BrowserOSIcon } from '@/lib/llm-providers/providerIcons'
import { cn } from '@/lib/utils'
import { AdapterAgentsPane } from './AdapterAgentsPane'
import {
  type AiSettingsSection,
  BROWSEROS_SECTION,
  resolveAiSettingsSection,
} from './ai-settings-sections'
import { BrowserOsAiPane } from './BrowserOsAiPane'

interface SectionItem {
  id: AiSettingsSection
  label: string
  icon: ReactNode
}

/**
 * AI & Agents settings shell. A `?section=`-driven tabbed page: a BrowserOS AI
 * tab (the LLM-providers pane) plus one tab per visible harness adapter
 * (Claude/Codex; Hermes filtered out). The pane below swaps on the active tab.
 */
export const AISettingsPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { adapters } = useAgentAdapters()

  const shownAdapters = visibleAdapters(adapters)
  const activeSection = resolveAiSettingsSection(
    searchParams.get('section'),
    shownAdapters.map((adapter) => adapter.id),
  )

  const items: SectionItem[] = [
    {
      id: BROWSEROS_SECTION,
      label: 'BrowserOS AI',
      icon: <BrowserOSIcon size={16} />,
    },
    ...shownAdapters.map((adapter) => ({
      id: adapter.id,
      label: adapter.name || adapterLabel(adapter.id),
      icon: <AdapterIcon adapter={adapter.id} className="size-4" />,
    })),
  ]

  const selectSection = (id: AiSettingsSection) => {
    const next = new URLSearchParams(searchParams)
    if (id === BROWSEROS_SECTION) next.delete('section')
    else next.set('section', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-1 overflow-x-auto border-border/60 border-b">
        {items.map((item) => {
          const isActive = item.id === activeSection
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={cn(
                '-mb-px flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-medium text-sm transition-colors',
                isActive
                  ? 'border-[var(--accent-orange)] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="min-w-0">
        {activeSection === BROWSEROS_SECTION ? (
          <BrowserOsAiPane />
        ) : (
          <AdapterAgentsPane adapterId={activeSection as HarnessAgentAdapter} />
        )}
      </div>
    </div>
  )
}
