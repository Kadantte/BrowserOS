import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAgentServerUrl } from '@/lib/browseros/helpers'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

let msgCounter = 0
function nextMsgId(): string {
  return `msg-${++msgCounter}`
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const messagesLength = messages.length
  const lastMessageContent = messages[messages.length - 1]?.content ?? ''
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages and content updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messagesLength, lastMessageContent])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    setMessages((prev) => [
      ...prev,
      { id: nextMsgId(), role: 'user', content: text },
    ])
    setStreaming(true)

    // Add an empty assistant message to stream into
    const assistantId = nextMsgId()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ])

    try {
      const baseUrl = await getAgentServerUrl()
      const response = await fetch(`${baseUrl}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (!response.ok) {
        const err = await response.json()
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${(err as { error?: string }).error ?? 'Unknown error'}`,
          }
          return updated
        })
        return
      }

      const reader = (response.body as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try {
            const chunk = JSON.parse(line.slice(6))
            const content = chunk.choices?.[0]?.delta?.content
            if (content) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + content,
                }
                return updated
              })
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        updated[updated.length - 1] = {
          ...last,
          content: `Connection error: ${err instanceof Error ? err.message : 'Failed to reach agent'}`,
        }
        return updated
      })
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-2 border-b pb-4">
        <Button variant="ghost" size="icon" className="size-8" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="font-semibold text-lg">{agentName}</h1>
          <p className="text-muted-foreground text-xs">
            Chat with your OpenClaw agent
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Send a message to start chatting with your agent.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-4 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted',
              )}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              {msg.role === 'assistant' &&
                streaming &&
                i === messages.length - 1 &&
                !msg.content && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t pt-4">
        <Input
          ref={inputRef}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          disabled={streaming}
        />
        <Button
          size="icon"
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
        >
          {streaming ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
