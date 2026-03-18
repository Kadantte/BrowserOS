import { Check, Loader2, PencilLine, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useKimiLaunch } from '@/lib/feature-flags/useKimiLaunch'
import { BrowserOSIcon, ProviderIcon } from '@/lib/llm-providers/providerIcons'
import { getProviderTemplate } from '@/lib/llm-providers/providerTemplates'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { cn } from '@/lib/utils'

interface ProviderCardProps {
  provider: LlmProviderConfig
  isSelected: boolean
  isBuiltIn: boolean
  onSelect: () => void
  onTest?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isTesting?: boolean
}

/** Card component for displaying a configured LLM provider */
export const ProviderCard: FC<ProviderCardProps> = ({
  provider,
  isSelected,
  isBuiltIn,
  onSelect,
  onTest,
  onEdit,
  onDelete,
  isTesting = false,
}) => {
  const inputId = `provider-${provider.id}`
  const kimiLaunch = useKimiLaunch()
  const providerLabel = isBuiltIn
    ? 'BrowserOS hosted'
    : (getProviderTemplate(provider.type)?.name ?? provider.type)
  const providerHost = getProviderHost(provider.baseUrl)
  const detailBadges = [providerLabel, provider.modelId, providerHost].filter(
    Boolean,
  )
  const description = getProviderDescription({
    provider,
    isBuiltIn,
    kimiLaunch,
  })

  return (
    <div
      className={cn(
        'group rounded-2xl border bg-card p-4 transition-all',
        isSelected
          ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)]/5 shadow-md'
          : 'border-border hover:border-[var(--accent-orange)]/50 hover:shadow-sm',
      )}
    >
      <input
        type="radio"
        id={inputId}
        name="default-provider"
        className="sr-only"
        checked={isSelected}
        onChange={() => onSelect()}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-start gap-4 text-left"
        >
          <div
            className={cn(
              'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
              isSelected
                ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)]'
                : 'border-border bg-background',
            )}
          >
            {isSelected && <Check className="h-3 w-3 text-white" />}
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]">
            {isBuiltIn ? (
              <BrowserOSIcon size={24} />
            ) : (
              <ProviderIcon type={provider.type} size={24} />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[15px]">{provider.name}</span>
              {isSelected && (
                <Badge
                  variant="secondary"
                  className="rounded-full bg-[var(--accent-orange)]/10 px-3 py-1 text-[var(--accent-orange)]"
                >
                  Default
                </Badge>
              )}
              {provider.type === 'chatgpt-pro' && (
                <Badge
                  variant="outline"
                  className="rounded-full border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-1 text-emerald-700 dark:text-emerald-300"
                >
                  Managed OAuth
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm leading-5">
              {description}
            </p>
            <div className="flex flex-wrap gap-2">
              {detailBadges.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                  className="rounded-full px-3 py-1 text-muted-foreground"
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </button>
        {!isBuiltIn && (
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={isTesting}
              onClick={() => onTest?.()}
            >
              {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isTesting ? 'Testing...' : 'Test'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit?.()}>
              <PencilLine className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete?.()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function getProviderHost(baseUrl?: string): string | null {
  if (!baseUrl) return null
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl.replace(/^https?:\/\//, '')
  }
}

function getProviderDescription({
  provider,
  isBuiltIn,
  kimiLaunch,
}: {
  provider: LlmProviderConfig
  isBuiltIn: boolean
  kimiLaunch: boolean
}) {
  if (isBuiltIn) {
    if (kimiLaunch) {
      return 'Extended usage limits are enabled through the Moonshot AI partnership.'
    }
    return 'BrowserOS-hosted model with stricter shared limits than bring-your-own-provider setups.'
  }

  if (provider.type === 'chatgpt-pro') {
    return 'Connected through your ChatGPT account so you can use the managed BrowserOS flow without local API keys.'
  }

  if (provider.baseUrl) {
    return `Configured against ${provider.baseUrl}.`
  }

  return 'Custom provider configuration.'
}
