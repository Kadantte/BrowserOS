import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ConversationMessage } from '@/entrypoints/app/agent-command/ConversationMessage'
import { useAgentConversation } from '@/entrypoints/app/agent-command/useAgentConversation'

interface AgentChatProps {
  agentId: string
  agentName: string
  onBack: () => void
}

export const AgentChat: FC<AgentChatProps> = ({
  agentId,
  agentName,
  onBack,
}) => {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { turns, streaming, loading, send } = useAgentConversation(
    agentId,
    agentName,
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on conversation changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [turns])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) {
      return
    }
    setInput('')
    await send(text)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="font-semibold text-lg">{agentName}</h2>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Loading conversation...
          </div>
        ) : (
          turns.map((turn, index) => (
            <ConversationMessage
              key={turn.id}
              turn={turn}
              streaming={streaming && index === turns.length - 1}
            />
          ))
        )}
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder="Send a message..."
            className="min-h-[44px] resize-none"
            rows={1}
          />
          <Button
            onClick={() => {
              void handleSend()
            }}
            disabled={!input.trim() || streaming}
            size="icon"
          >
            {streaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
