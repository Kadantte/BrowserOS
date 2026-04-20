import {
  Check,
  Github,
  History,
  MessageSquare,
  MousePointer2,
  Plus,
  SettingsIcon,
} from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { ChatProviderSelector } from '@/components/chat/ChatProviderSelector'
import type { Provider } from '@/components/chat/chatComponentTypes'
import { ThemeToggle } from '@/components/elements/theme-toggle'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { productRepositoryUrl } from '@/lib/constants/productUrls'
import { BrowserOSIcon, ProviderIcon } from '@/lib/llm-providers/providerIcons'
import type { ProviderType } from '@/lib/llm-providers/types'
import { cn } from '@/lib/utils'
import type { ChatMode } from '../chatTypes'
import { useElapsedTimer } from './useElapsedTimer'

type ChatStatus = 'streaming' | 'submitted' | 'ready' | 'error'

interface StatusPillProps {
  status: ChatStatus
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  selectedProvider: Provider
  providers: Provider[]
  onSelectProvider: (p: Provider) => void
  onNewConversation: () => void
  hasMessages: boolean
}

const isBusy = (s: ChatStatus) => s === 'submitted' || s === 'streaming'

export const StatusPill: FC<StatusPillProps> = ({
  status,
  mode,
  onModeChange,
  selectedProvider,
  providers,
  onSelectProvider,
  onNewConversation,
  hasMessages,
}) => {
  const elapsed = useElapsedTimer(isBusy(status))
  const navigate = useNavigate()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-[11.5px] shadow-sm transition-colors hover:bg-muted/50"
        >
          <StatusDot status={status} />
          <PillLabel
            status={status}
            mode={mode}
            providerName={selectedProvider.name}
            elapsed={elapsed}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-64 p-0"
        sideOffset={6}
      >
        <div className="space-y-1 p-1">
          <ProviderRow
            selectedProvider={selectedProvider}
            providers={providers}
            onSelectProvider={onSelectProvider}
          />
          <ModeRow mode={mode} onModeChange={onModeChange} />
        </div>
        <div className="border-border/60 border-t p-1">
          {hasMessages && (
            <MenuButton
              icon={<Plus className="h-3.5 w-3.5" />}
              label="New conversation"
              onClick={onNewConversation}
            />
          )}
          <MenuButton
            icon={<History className="h-3.5 w-3.5" />}
            label="Chat history"
            onClick={() => navigate('/history')}
          />
          <MenuLink
            icon={<Github className="h-3.5 w-3.5" />}
            label="Star on Github"
            href={productRepositoryUrl}
          />
          <MenuLink
            icon={<SettingsIcon className="h-3.5 w-3.5" />}
            label="Settings"
            href="/app.html#/settings"
          />
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm">
            <span>Theme</span>
            <ThemeToggle iconClassName="h-3.5 w-3.5" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const StatusDot: FC<{ status: ChatStatus }> = ({ status }) => {
  const colorClass =
    status === 'error'
      ? 'bg-destructive'
      : isBusy(status)
        ? 'animate-pulse bg-[var(--accent-orange)]'
        : 'bg-muted-foreground/60'
  return <span className={cn('h-1.5 w-1.5 rounded-full', colorClass)} />
}

const PillLabel: FC<{
  status: ChatStatus
  mode: ChatMode
  providerName: string
  elapsed: string
}> = ({ status, mode, providerName, elapsed }) => {
  if (status === 'error') {
    return <span className="font-medium text-destructive">Failed</span>
  }
  if (isBusy(status)) {
    return (
      <>
        <span className="font-medium">Running</span>
        <span className="text-muted-foreground">· {elapsed}</span>
      </>
    )
  }
  const modeLabel = mode === 'agent' ? 'Agent' : 'Chat'
  return (
    <>
      <span className="font-medium">{providerName}</span>
      <span className="text-muted-foreground">· {modeLabel}</span>
    </>
  )
}

const ProviderRow: FC<{
  selectedProvider: Provider
  providers: Provider[]
  onSelectProvider: (p: Provider) => void
}> = ({ selectedProvider, providers, onSelectProvider }) => (
  <ChatProviderSelector
    providers={providers}
    selectedProvider={selectedProvider}
    onSelectProvider={onSelectProvider}
  >
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
    >
      {selectedProvider.type === 'browseros' ? (
        <BrowserOSIcon size={14} />
      ) : (
        <ProviderIcon type={selectedProvider.type as ProviderType} size={14} />
      )}
      <span className="flex-1 truncate text-left">{selectedProvider.name}</span>
      <span className="text-muted-foreground text-xs">Provider</span>
    </button>
  </ChatProviderSelector>
)

const ModeRow: FC<{ mode: ChatMode; onModeChange: (m: ChatMode) => void }> = ({
  mode,
  onModeChange,
}) => {
  const isAgent = mode === 'agent'
  return (
    <div className="flex items-center gap-1 rounded-md p-1">
      <ModeButton
        active={!isAgent}
        onClick={() => onModeChange('chat')}
        icon={<MessageSquare className="h-3 w-3" />}
        label="Chat"
      />
      <ModeButton
        active={isAgent}
        onClick={() => onModeChange('agent')}
        icon={<MousePointer2 className="h-3 w-3" />}
        label="Agent"
      />
    </div>
  )
}

const ModeButton: FC<{
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 font-medium text-xs transition-colors',
      active
        ? 'bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    )}
  >
    {icon}
    {label}
    {active && <Check className="h-2.5 w-2.5" />}
  </button>
)

const MenuButton: FC<{
  icon: React.ReactNode
  label: string
  onClick: () => void
}> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
  >
    <span className="text-muted-foreground">{icon}</span>
    <span>{label}</span>
  </button>
)

const MenuLink: FC<{
  icon: React.ReactNode
  label: string
  href: string
}> = ({ icon, label, href }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
  >
    <span className="text-muted-foreground">{icon}</span>
    <span>{label}</span>
  </a>
)
