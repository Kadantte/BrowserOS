import type { UIMessageStreamEvent } from '@browseros/shared/schemas/ui-stream'
import { useEffect, useRef, useState } from 'react'
import { chatWithAgent } from '@/entrypoints/app/agents/useAgents'
import {
  buildBrowserOsConversation,
  createBrowserOsAgentStreamState,
  reduceBrowserOsAgentStreamEvent,
} from '@/lib/agent-conversations/browseros-agent-chat'
import {
  getLatestConversation,
  saveConversation,
} from '@/lib/agent-conversations/storage'
import type {
  AgentConversation,
  AgentConversationTurn,
} from '@/lib/agent-conversations/types'
import { consumeSSEStream } from '@/lib/sse'

export function useAgentConversation(agentId: string, agentName: string) {
  const [turns, setTurns] = useState<AgentConversationTurn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(true)
  const sessionKeyRef = useRef('')
  const streamStateRef = useRef(createBrowserOsAgentStreamState())
  const streamAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    getLatestConversation(agentId)
      .then((conv) => {
        if (!active) return
        if (conv) {
          setTurns(conv.turns)
          sessionKeyRef.current = conv.sessionKey
        } else {
          sessionKeyRef.current = crypto.randomUUID()
        }
        setLoading(false)
      })
      .catch(() => {
        if (active) {
          sessionKeyRef.current = crypto.randomUUID()
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [agentId])

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
    }
  }, [])

  const persistTurns = (updatedTurns: AgentConversationTurn[]) => {
    const conv: AgentConversation = {
      agentId,
      agentName,
      sessionKey: sessionKeyRef.current,
      turns: updatedTurns,
      createdAt: updatedTurns[0]?.timestamp ?? Date.now(),
      updatedAt: Date.now(),
    }
    saveConversation(conv).catch(() => {})
  }

  const updateCurrentTurnParts = (
    updater: (turn: AgentConversationTurn) => AgentConversationTurn,
  ) => {
    setTurns((prev) => {
      const last = prev[prev.length - 1]
      if (!last) return prev
      const updated = [...prev.slice(0, -1), updater(last)]
      if (updated[updated.length - 1]?.done) {
        persistTurns(updated)
      }
      return updated
    })
  }

  const processStreamEvent = (event: UIMessageStreamEvent) => {
    streamStateRef.current = reduceBrowserOsAgentStreamEvent(
      streamStateRef.current,
      event,
    )
    updateCurrentTurnParts((turn) => ({
      ...turn,
      parts: streamStateRef.current.parts,
      done: streamStateRef.current.done,
    }))
  }

  const send = async (text: string) => {
    if (!text.trim() || streaming) return

    const message = text.trim()
    const conversation = buildBrowserOsConversation(turns)
    const turn: AgentConversationTurn = {
      id: crypto.randomUUID(),
      userText: message,
      parts: [],
      done: false,
      timestamp: Date.now(),
    }
    setTurns((prev) => [...prev, turn])
    setStreaming(true)
    streamStateRef.current = createBrowserOsAgentStreamState()
    const abortController = new AbortController()
    streamAbortRef.current = abortController

    try {
      const response = await chatWithAgent(
        agentId,
        {
          message,
          sessionKey: sessionKeyRef.current,
          conversation,
        },
        abortController.signal,
      )
      if (!response.ok) {
        const err = await readErrorResponse(response)
        processStreamEvent({ type: 'error', errorText: err })
        return
      }
      await consumeSSEStream(
        response,
        processStreamEvent,
        abortController.signal,
      )
    } catch (err) {
      if (abortController.signal.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      processStreamEvent({ type: 'error', errorText: msg })
    } finally {
      if (streamAbortRef.current === abortController) {
        streamAbortRef.current = null
      }
      setStreaming(false)
    }
  }

  const resetConversation = () => {
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    setTurns([])
    setStreaming(false)
    sessionKeyRef.current = crypto.randomUUID()
    streamStateRef.current = createBrowserOsAgentStreamState()
  }

  return {
    turns,
    streaming,
    loading,
    sessionKey: sessionKeyRef.current,
    send,
    resetConversation,
  }
}

async function readErrorResponse(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) {
      return body.error
    }
  } catch {}
  return `Request failed with status ${response.status}`
}
