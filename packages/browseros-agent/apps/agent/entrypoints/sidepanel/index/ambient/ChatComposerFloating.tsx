import { ChevronDown, Folder, Layers, PlugZap, Sparkles } from 'lucide-react'
import type { FC, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AppSelector } from '@/components/elements/AppSelector'
import { WorkspaceSelector } from '@/components/elements/workspace-selector'
import { McpServerIcon } from '@/entrypoints/app/connect-mcp/McpServerIcon'
import { useGetUserMCPIntegrations } from '@/entrypoints/app/connect-mcp/useGetUserMCPIntegrations'
import { Feature } from '@/lib/browseros/capabilities'
import { useCapabilities } from '@/lib/browseros/useCapabilities'
import { useMcpServers } from '@/lib/mcp/mcpServerStorage'
import {
  type SelectedTextData,
  selectedTextStorage,
} from '@/lib/selected-text/selectedTextStorage'
import { cn } from '@/lib/utils'
import type { VoiceInputState } from '@/lib/voice/useVoiceInput'
import { useWorkspace } from '@/lib/workspace/use-workspace'
import { ChatAttachedTabs } from '../ChatAttachedTabs'
import { ChatInput, type ChatInputHandle } from '../ChatInput'
import { ChatSelectedText } from '../ChatSelectedText'
import type { ChatMode } from '../chatTypes'

interface ChatComposerFloatingProps {
  mode: ChatMode
  input: string
  onInputChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  onStop: () => void
  attachedTabs: chrome.tabs.Tab[]
  onToggleTab: (t: chrome.tabs.Tab) => void
  onRemoveTab: (id?: number) => void
  voice?: VoiceInputState
}

export const ChatComposerFloating: FC<ChatComposerFloatingProps> = ({
  mode,
  input,
  onInputChange,
  onSubmit,
  status,
  onStop,
  attachedTabs,
  onToggleTab,
  onRemoveTab,
  voice,
}) => {
  const { selectedFolder } = useWorkspace()
  const { supports } = useCapabilities()
  const { servers: mcpServers } = useMcpServers()
  const { data: userMCPIntegrations } = useGetUserMCPIntegrations()
  const chatInputRef = useRef<ChatInputHandle>(null)
  const [selectionMap, setSelectionMap] = useState<
    Record<string, SelectedTextData>
  >({})
  const [activeTabId, setActiveTabId] = useState<number | undefined>()
  const [isTabMentionOpen, setIsTabMentionOpen] = useState(false)

  useEffect(() => {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setActiveTabId(tabs[0]?.id))
    const listener = (activeInfo: { tabId: number }) => {
      setActiveTabId(activeInfo.tabId)
    }
    chrome.tabs.onActivated.addListener(listener)
    return () => chrome.tabs.onActivated.removeListener(listener)
  }, [])

  useEffect(() => {
    selectedTextStorage.getValue().then(setSelectionMap)
    const unwatch = selectedTextStorage.watch(setSelectionMap)
    return () => unwatch()
  }, [])

  useEffect(() => {
    const focusInput = () => {
      const active = document.activeElement
      const isInteractiveElementFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLButtonElement
      if (!isInteractiveElementFocused) {
        chatInputRef.current?.focus()
      }
    }
    if (document.hasFocus()) {
      focusInput()
    }
    window.addEventListener('focus', focusInput)
    return () => window.removeEventListener('focus', focusInput)
  }, [])

  const visibleSelectedText = activeTabId
    ? (selectionMap[String(activeTabId)] ?? null)
    : null

  const connectedManagedServers = mcpServers.filter((s) => {
    if (s.type !== 'managed' || !s.managedServerName) return false
    return userMCPIntegrations?.integrations?.find(
      (i) => i.name === s.managedServerName,
    )?.is_authenticated
  })

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-6">
      <div className="pointer-events-auto w-full max-w-[720px]">
        {(attachedTabs.length > 0 || visibleSelectedText) && (
          <div className="mb-2 overflow-hidden rounded-[14px] border border-border bg-background shadow-[0_4px_18px_rgba(0,0,0,0.06)]">
            <ChatAttachedTabs tabs={attachedTabs} onRemoveTab={onRemoveTab} />
            {visibleSelectedText && (
              <ChatSelectedText
                selectedText={visibleSelectedText}
                onDismiss={() => {
                  if (!activeTabId) return
                  const key = String(activeTabId)
                  selectedTextStorage.getValue().then((map) => {
                    const { [key]: _, ...rest } = map
                    selectedTextStorage.setValue(rest)
                  })
                }}
              />
            )}
          </div>
        )}

        <div className="rounded-[14px] border border-border bg-background px-3.5 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.10)] sm:shadow-[0_8px_40px_rgba(0,0,0,0.08)]">
          <div className="flex items-start gap-2 [&_form]:mt-0 [&_textarea:focus]:border-0 [&_textarea:hover]:border-0 [&_textarea]:rounded-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-0 [&_textarea]:py-2">
            <Sparkles className="mt-[11px] h-[15px] w-[15px] shrink-0 text-[var(--accent-orange)]" />
            <div className="flex-1">
              <ChatInput
                ref={chatInputRef}
                input={input}
                status={status}
                mode={mode}
                onInputChange={onInputChange}
                onSubmit={onSubmit}
                onStop={onStop}
                selectedTabs={attachedTabs}
                onToggleTab={onToggleTab}
                onTabMentionOpenChange={setIsTabMentionOpen}
                voice={voice}
              />
            </div>
          </div>

          {voice?.error && (
            <div className="mt-1 text-destructive text-xs">{voice.error}</div>
          )}

          <div className="mt-2 flex items-center gap-3 pl-[23px] text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => chatInputRef.current?.toggleTabMention()}
              data-tab-mention-trigger
              data-state={isTabMentionOpen ? 'open' : 'closed'}
              aria-expanded={isTabMentionOpen}
              aria-haspopup="dialog"
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground data-[state=open]:text-foreground',
                attachedTabs.length > 0 && 'text-foreground',
              )}
              title="Attach tabs (@)"
            >
              <Layers className="h-3 w-3" />
              <span>
                {attachedTabs.length > 0
                  ? `${attachedTabs.length} tab${attachedTabs.length > 1 ? 's' : ''}`
                  : 'tabs'}
              </span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>

            {supports(Feature.WORKSPACE_FOLDER_SUPPORT) && (
              <WorkspaceSelector side="top">
                <button
                  type="button"
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground data-[state=open]:text-foreground',
                    selectedFolder && 'text-foreground',
                  )}
                  title={selectedFolder ? selectedFolder.name : 'Workspace'}
                >
                  <Folder className="h-3 w-3" />
                  <span>{selectedFolder?.name ?? 'workspace'}</span>
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </WorkspaceSelector>
            )}

            {supports(Feature.MANAGED_MCP_SUPPORT) && (
              <AppSelector side="top">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground data-[state=open]:text-foreground"
                  title="Connect apps"
                >
                  {connectedManagedServers.length > 0 ? (
                    <>
                      <div className="flex items-center -space-x-1">
                        {connectedManagedServers.slice(0, 3).map((s) => (
                          <div
                            key={s.id}
                            className="rounded-full ring-2 ring-background"
                          >
                            <McpServerIcon
                              serverName={s.managedServerName ?? ''}
                              size={10}
                            />
                          </div>
                        ))}
                      </div>
                      {connectedManagedServers.length > 3 && (
                        <span>+{connectedManagedServers.length - 3}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <PlugZap className="h-3 w-3" />
                      <span>apps</span>
                    </>
                  )}
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </AppSelector>
            )}

            <div className="flex-1" />
            <span className="hidden sm:inline">/ commands · @ mention</span>
          </div>
        </div>
      </div>
    </div>
  )
}
