import { Loader2, Send } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AgentEntry } from '@/entrypoints/app/agents/useOpenClaw'
import { AgentSelector } from './AgentSelector'

interface ConversationInputProps {
  agents: AgentEntry[]
  selectedAgentId: string | null
  onSelectAgent: (agent: AgentEntry) => void
  onSend: (text: string) => void
  onCreateAgent?: () => void
  streaming: boolean
  disabled?: boolean
  status?: string
  placeholder?: string
}

export const ConversationInput: FC<ConversationInputProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  onSend,
  onCreateAgent,
  streaming,
  disabled,
  status,
  placeholder,
}) => {
  const [input, setInput] = useState('')
  const selectedAgent = agents.find((a) => a.agentId === selectedAgentId)

  const handleSend = () => {
    const text = input.trim()
    if (!text || streaming || disabled) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="flex items-end gap-2">
        <AgentSelector
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          onCreateAgent={onCreateAgent}
          status={status}
        />
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={
            placeholder ?? `Message ${selectedAgent?.name ?? 'agent'}...`
          }
          className="min-h-[44px] flex-1 resize-none"
          rows={1}
          disabled={disabled}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || streaming || disabled}
          size="icon"
          className="shrink-0"
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
