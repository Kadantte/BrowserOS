import { Home, Plus } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import type { Provider } from '@/components/chat/chatComponentTypes'
import type { ChatMode } from '../chatTypes'
import { StatusPill } from './StatusPill'

interface ChatOverlayBarProps {
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  mode: ChatMode
  onModeChange: (m: ChatMode) => void
  selectedProvider: Provider
  providers: Provider[]
  onSelectProvider: (p: Provider) => void
  onNewConversation: () => void
  hasMessages: boolean
}

export const ChatOverlayBar: FC<ChatOverlayBarProps> = ({
  status,
  mode,
  onModeChange,
  selectedProvider,
  providers,
  onSelectProvider,
  onNewConversation,
  hasMessages,
}) => {
  const navigate = useNavigate()

  return (
    <div className="pointer-events-none absolute inset-x-5 top-4 z-40 flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => navigate('/')}
        title="Home"
        className="pointer-events-auto inline-flex cursor-pointer items-center justify-center rounded-full border border-border bg-background p-1.5 text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
      </button>

      <div className="flex flex-1 justify-center">
        <StatusPill
          status={status}
          mode={mode}
          onModeChange={onModeChange}
          selectedProvider={selectedProvider}
          providers={providers}
          onSelectProvider={onSelectProvider}
          onNewConversation={onNewConversation}
          hasMessages={hasMessages}
        />
      </div>

      <button
        type="button"
        onClick={onNewConversation}
        title="New conversation"
        className="pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-[11.5px] text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  )
}
