import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserOSAction } from '@/lib/chat-actions/types'
import {
  SIDEPANEL_AI_TRIGGERED_EVENT,
  SIDEPANEL_MODE_CHANGED_EVENT,
  SIDEPANEL_STOP_CLICKED_EVENT,
  SIDEPANEL_SUGGESTION_CLICKED_EVENT,
  SIDEPANEL_TAB_REMOVED_EVENT,
  SIDEPANEL_TAB_TOGGLED_EVENT,
  SIDEPANEL_VOICE_ERROR_EVENT,
  SIDEPANEL_VOICE_RECORDING_STARTED_EVENT,
  SIDEPANEL_VOICE_RECORDING_STOPPED_EVENT,
  SIDEPANEL_VOICE_TRANSCRIPTION_COMPLETED_EVENT,
} from '@/lib/constants/analyticsEvents'
import { useJtbdPopup } from '@/lib/jtbd-popup/useJtbdPopup'
import { track } from '@/lib/metrics/track'
import { useVoiceInput } from '@/lib/voice/useVoiceInput'
import { useChatSessionContext } from '../layout/ChatSessionContext'
import { ChatComposerFloating } from './ambient/ChatComposerFloating'
import { ChatOverlayBar } from './ambient/ChatOverlayBar'
import { EditorialHeader } from './ambient/EditorialHeader'
import { ChatError } from './ChatError'
import { ChatMessages } from './ChatMessages'
import { AGENT_SUGGESTIONS, CHAT_SUGGESTIONS, type ChatMode } from './chatTypes'

/**
 * @public
 */
export const Chat = () => {
  const {
    mode,
    setMode,
    messages,
    sendMessage,
    status,
    stop,
    agentUrlError,
    chatError,
    providers,
    selectedProvider,
    handleSelectProvider,
    resetConversation,
    getActionForMessage,
    liked,
    onClickLike,
    disliked,
    onClickDislike,
    isRestoringConversation,
    addToolApprovalResponse,
  } = useChatSessionContext()

  const {
    popupVisible,
    showDontShowAgain,
    recordMessageSent,
    triggerIfEligible,
    onTakeSurvey,
    onDismiss: onDismissJtbdPopup,
  } = useJtbdPopup()

  const voice = useVoiceInput()

  const [input, setInput] = useState('')
  const [attachedTabs, setAttachedTabs] = useState<chrome.tabs.Tab[]>([])
  const [mounted, setMounted] = useState(false)

  const sessionHash = useMemo(() => {
    return crypto.randomUUID().slice(0, 6)
    // Rotates on full remount (new provider / new session); fine for display-only.
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    ;(async () => {
      const currentTab = (
        await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
      ).filter((tab) => tab.url?.startsWith('http'))
      setAttachedTabs(currentTab)
    })()
  }, [])

  // Trigger JTBD popup when AI finishes responding
  const previousChatStatus = useRef(status)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only trigger on status change
  useEffect(() => {
    const aiWasProcessing =
      previousChatStatus.current === 'streaming' ||
      previousChatStatus.current === 'submitted'
    const aiJustFinished = aiWasProcessing && status === 'ready'

    if (aiJustFinished && messages.length > 0) {
      triggerIfEligible()
    }
    previousChatStatus.current = status
  }, [status])

  // Insert transcript into input when transcription completes
  // biome-ignore lint/correctness/useExhaustiveDependencies: only trigger on transcript/transcribing change
  useEffect(() => {
    if (voice.transcript && !voice.isTranscribing) {
      setInput((prev) => {
        const separator = prev.trim() ? ' ' : ''
        return prev + separator + voice.transcript
      })
      track(SIDEPANEL_VOICE_TRANSCRIPTION_COMPLETED_EVENT)
      voice.clearTranscript()
    }
  }, [voice.transcript, voice.isTranscribing])

  // Track voice errors
  useEffect(() => {
    if (voice.error) {
      track(SIDEPANEL_VOICE_ERROR_EVENT, { error: voice.error })
    }
  }, [voice.error])

  const handleModeChange = (newMode: ChatMode) => {
    track(SIDEPANEL_MODE_CHANGED_EVENT, { from: mode, to: newMode })
    setMode(newMode)
  }

  const handleStop = () => {
    track(SIDEPANEL_STOP_CLICKED_EVENT)
    stop()
  }

  const toggleTabSelection = (tab: chrome.tabs.Tab) => {
    setAttachedTabs((prev) => {
      const isSelected = prev.some((t) => t.id === tab.id)
      track(SIDEPANEL_TAB_TOGGLED_EVENT, {
        action: isSelected ? 'removed' : 'added',
      })
      if (isSelected) {
        return prev.filter((t) => t.id !== tab.id)
      }
      return [...prev, tab]
    })
  }

  const removeTab = (tabId?: number) => {
    track(SIDEPANEL_TAB_REMOVED_EVENT)
    setAttachedTabs((prev) => prev.filter((t) => t.id !== tabId))
  }

  const executeMessage = (customMessageText?: string) => {
    const messageText = customMessageText ? customMessageText : input.trim()
    if (!messageText) return

    recordMessageSent()

    if (attachedTabs.length) {
      const action = createBrowserOSAction({
        mode,
        message: messageText,
        tabs: attachedTabs,
      })
      sendMessage({ text: messageText, action })
    } else {
      sendMessage({ text: messageText })
    }
    setInput('')
    setAttachedTabs([])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (messages.length === 0) {
      track(SIDEPANEL_AI_TRIGGERED_EVENT, {
        mode,
        tabs_count: attachedTabs.length,
      })
    }
    executeMessage()
  }

  const handleSuggestionClick = (suggestion: string) => {
    track(SIDEPANEL_SUGGESTION_CLICKED_EVENT, { mode })
    executeMessage(suggestion)
  }

  const handleStartRecording = async () => {
    const started = await voice.startRecording()
    if (started) {
      track(SIDEPANEL_VOICE_RECORDING_STARTED_EVENT)
    }
  }

  const handleStopRecording = async () => {
    await voice.stopRecording()
    track(SIDEPANEL_VOICE_RECORDING_STOPPED_EVENT)
  }

  const voiceState = {
    isRecording: voice.isRecording,
    isTranscribing: voice.isTranscribing,
    audioLevels: voice.audioLevels,
    error: voice.error,
    onStartRecording: handleStartRecording,
    onStopRecording: handleStopRecording,
  }

  const suggestions = mode === 'chat' ? CHAT_SUGGESTIONS : AGENT_SUGGESTIONS
  const title = selectedProvider?.name ?? 'Agent'
  const subtitleParts = [
    mode === 'agent' ? 'Agent mode' : 'Chat with this page',
    `session/${sessionHash}`,
    `${messages.length} turn${messages.length === 1 ? '' : 's'}`,
  ]

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <ChatOverlayBar
        status={status}
        mode={mode}
        onModeChange={handleModeChange}
        selectedProvider={selectedProvider}
        providers={providers}
        onSelectProvider={handleSelectProvider}
        onNewConversation={resetConversation}
        hasMessages={messages.length > 0}
      />

      <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {isRestoringConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            status={status}
            getActionForMessage={getActionForMessage}
            liked={liked}
            onClickLike={onClickLike}
            disliked={disliked}
            onClickDislike={onClickDislike}
            showJtbdPopup={popupVisible}
            showDontShowAgain={showDontShowAgain}
            onTakeSurvey={onTakeSurvey}
            onDismissJtbdPopup={onDismissJtbdPopup}
            onToolApprove={(id) =>
              addToolApprovalResponse({ id, approved: true })
            }
            onToolDeny={(id) =>
              addToolApprovalResponse({ id, approved: false })
            }
            variant="ambient"
            header={
              <EditorialHeader title={title} subtitleParts={subtitleParts} />
            }
            emptyStateSlot={
              <AmbientEmptyStateSuggestions
                mounted={mounted}
                suggestions={suggestions}
                onClick={handleSuggestionClick}
              />
            }
          />
        )}
        {agentUrlError && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[130px] z-20 flex justify-center px-6">
            <div className="pointer-events-auto w-full max-w-[720px]">
              <ChatError
                error={agentUrlError}
                providerType={selectedProvider?.type}
              />
            </div>
          </div>
        )}
        {chatError && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[130px] z-20 flex justify-center px-6">
            <div className="pointer-events-auto w-full max-w-[720px]">
              <ChatError
                error={chatError}
                providerType={selectedProvider?.type}
              />
            </div>
          </div>
        )}
      </main>

      <ChatComposerFloating
        mode={mode}
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        status={status}
        onStop={handleStop}
        attachedTabs={attachedTabs}
        onToggleTab={toggleTabSelection}
        onRemoveTab={removeTab}
        voice={voiceState}
      />
    </div>
  )
}

const AmbientEmptyStateSuggestions: React.FC<{
  mounted: boolean
  suggestions: { display: string; prompt: string; icon: string }[]
  onClick: (prompt: string) => void
}> = ({ mounted, suggestions, onClick }) => (
  <div
    className={`mt-2 flex flex-col gap-2 transition-all duration-500 ${
      mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
    }`}
  >
    <div className="mb-1 text-[13px] text-muted-foreground">Try asking…</div>
    {suggestions.map((s) => (
      <button
        type="button"
        key={s.display}
        onClick={() => onClick(s.prompt)}
        className="group flex items-center justify-between rounded-[10px] border border-border bg-background px-3.5 py-3 text-left text-sm transition-all hover:border-[var(--accent-orange)]/50 hover:bg-[var(--accent-orange)]/5"
      >
        <span>{s.display}</span>
        <span className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {s.icon}
        </span>
      </button>
    ))}
  </div>
)
