import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
  Unplug,
} from 'lucide-react'
import type { FC } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProviderIcon } from '@/lib/llm-providers/providerIcons'
import { getProviderTemplate } from '@/lib/llm-providers/providerTemplates'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { cn } from '@/lib/utils'

interface ChatGPTProFeatureCardProps {
  provider?: LlmProviderConfig
  email?: string
  isAuthenticated: boolean
  isPolling: boolean
  isDefault: boolean
  onConnect: () => void
  onDisconnect: () => void
  onMakeDefault: () => void
}

type ChatGPTProState =
  | 'disconnected'
  | 'connecting'
  | 'provisioning'
  | 'connected'

function getChatGPTProState(
  isAuthenticated: boolean,
  isPolling: boolean,
  provider?: LlmProviderConfig,
): ChatGPTProState {
  if (isPolling) return 'connecting'
  if (isAuthenticated && provider) return 'connected'
  if (isAuthenticated) return 'provisioning'
  return 'disconnected'
}

function getStateCopy(state: ChatGPTProState, isDefault: boolean) {
  switch (state) {
    case 'connecting':
      return {
        badge: 'Waiting for sign-in',
        title: 'Finish the login in the opened ChatGPT tab',
        description:
          'BrowserOS is polling for completion and will finish setup automatically once your ChatGPT account is authenticated.',
      }
    case 'provisioning':
      return {
        badge: 'Finalizing setup',
        title: 'Authentication succeeded. Creating your provider now.',
        description:
          'The OAuth handshake is done. BrowserOS is applying the local provider configuration so the account can be used inside the extension.',
      }
    case 'connected':
      return {
        badge: isDefault ? 'Connected and default' : 'Connected',
        title: isDefault
          ? 'Your ChatGPT Plus/Pro account is ready to use'
          : 'Your ChatGPT Plus/Pro account is connected',
        description: isDefault
          ? 'This provider is already the default model route for BrowserOS chats.'
          : 'You can make it the default provider or keep it available alongside your other models.',
      }
    default:
      return {
        badge: 'Not connected',
        title: 'Connect ChatGPT Plus/Pro without managing API keys',
        description:
          'Use your ChatGPT subscription directly inside BrowserOS with managed OAuth, GPT-5/Codex-ready models, and the same provider list as the rest of your setup.',
      }
  }
}

export const ChatGPTProFeatureCard: FC<ChatGPTProFeatureCardProps> = ({
  provider,
  email,
  isAuthenticated,
  isPolling,
  isDefault,
  onConnect,
  onDisconnect,
  onMakeDefault,
}) => {
  const state = getChatGPTProState(isAuthenticated, isPolling, provider)
  const copy = getStateCopy(state, isDefault)
  const setupGuideUrl = getProviderTemplate('chatgpt-pro')?.setupGuideUrl
  const detailChips = [
    provider?.modelId ?? 'GPT-5 / Codex-ready',
    email ?? 'Managed OAuth',
    'No local API key',
  ]

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-orange-300/70 bg-[linear-gradient(135deg,rgba(255,247,239,0.98),rgba(240,251,247,0.96))] p-6 shadow-[0_20px_50px_-34px_rgba(191,98,22,0.45)] dark:border-orange-400/20 dark:bg-[linear-gradient(135deg,rgba(63,38,23,0.82),rgba(18,43,38,0.88))]">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(16,163,127,0.18),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(16,163,127,0.22),transparent_62%)]" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-transparent bg-foreground text-background">
              Featured integration
            </Badge>
            <Badge
              variant="outline"
              className="border-orange-400/40 bg-white/[0.65] text-foreground dark:bg-white/10"
            >
              {copy.badge}
            </Badge>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/10">
              <ProviderIcon
                type="chatgpt-pro"
                size={30}
                className="text-[#10a37f]"
              />
            </div>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-lg tracking-tight">
                  ChatGPT Plus/Pro
                </p>
                <h3 className="font-semibold text-3xl leading-tight tracking-tight">
                  {copy.title}
                </h3>
              </div>
              <p className="max-w-2xl text-[15px] text-foreground/75 leading-6 dark:text-foreground/80">
                {copy.description}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
              <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                <ShieldCheck className="h-4 w-4 text-[#10a37f]" />
                Managed access
              </div>
              <p className="text-muted-foreground text-sm leading-5">
                Start with an OAuth login instead of copying keys or endpoint
                values into the extension.
              </p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
              <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                <Sparkles className="h-4 w-4 text-[var(--accent-orange)]" />
                Premium models
              </div>
              <p className="text-muted-foreground text-sm leading-5">
                Keep ChatGPT Plus/Pro available for GPT-5 and Codex-style work
                inside BrowserOS.
              </p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
              <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--accent-orange)]" />
                Ready in settings
              </div>
              <p className="text-muted-foreground text-sm leading-5">
                Connect, confirm the account, and keep it alongside your other
                configured providers.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {detailChips.map((chip) => (
              <Badge
                key={chip}
                variant="outline"
                className="rounded-full border-white/70 bg-white/[0.65] px-3 py-1 text-foreground/80 dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-foreground/85"
              >
                {chip}
              </Badge>
            ))}
          </div>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-white/60 bg-white/[0.78] p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.08]">
          <p className="font-medium text-foreground/70 text-sm uppercase tracking-[0.18em]">
            Current status
          </p>
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 dark:bg-background/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">Account</p>
                  <p className="text-muted-foreground text-sm">
                    {email ?? 'Not signed in'}
                  </p>
                </div>
                <div
                  className={cn(
                    'rounded-full px-3 py-1 font-medium text-xs',
                    state === 'connected'
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      : state === 'connecting' || state === 'provisioning'
                        ? 'bg-orange-500/12 text-orange-700 dark:text-orange-300'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {copy.badge}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 dark:bg-background/30">
              <p className="font-medium text-sm">Provider</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {provider
                  ? `${provider.name} with ${provider.modelId}`
                  : 'A local provider entry will be created automatically after authentication.'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {(state === 'disconnected' || state === 'connecting') && (
              <Button
                size="lg"
                onClick={onConnect}
                className="w-full bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90"
              >
                {state === 'connecting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reopen login tab
                  </>
                ) : (
                  <>
                    Connect ChatGPT Plus/Pro
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}

            {state === 'provisioning' && (
              <Button size="lg" disabled className="w-full">
                <Loader2 className="h-4 w-4 animate-spin" />
                Finishing setup
              </Button>
            )}

            {state === 'connected' && !isDefault && (
              <Button
                size="lg"
                onClick={onMakeDefault}
                className="w-full bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90"
              >
                Make default provider
              </Button>
            )}

            {state === 'connected' && isDefault && (
              <Button size="lg" variant="secondary" disabled className="w-full">
                Default provider selected
              </Button>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {setupGuideUrl && (
                <Button variant="outline" className="flex-1" asChild>
                  <a
                    href={setupGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Setup guide
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {state === 'connected' && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onDisconnect}
                >
                  <Unplug className="h-4 w-4" />
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
