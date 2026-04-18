import type { UIMessageStreamEvent } from '@browseros/shared/schemas/ui-stream'
import type { AgentConversationTurn, AssistantPart, ToolEntry } from './types'

export interface BrowserOsConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface BrowserOsAgentStreamState {
  text: string
  reasoning: string
  reasoningStarted: boolean
  reasoningDone: boolean
  tools: ToolEntry[]
  done: boolean
  parts: AssistantPart[]
}

export function buildBrowserOsConversation(
  turns: AgentConversationTurn[],
): BrowserOsConversationTurn[] {
  return turns.flatMap((turn) => {
    const conversation: BrowserOsConversationTurn[] = [
      { role: 'user', text: turn.userText },
    ]
    const assistantText = turn.parts
      .filter(
        (part): part is Extract<AssistantPart, { kind: 'text' }> =>
          part.kind === 'text',
      )
      .map((part) => part.text)
      .join('')
      .trim()
    if (assistantText) {
      conversation.push({ role: 'assistant', text: assistantText })
    }
    return conversation
  })
}

export function createBrowserOsAgentStreamState(): BrowserOsAgentStreamState {
  return withDerivedParts({
    text: '',
    reasoning: '',
    reasoningStarted: false,
    reasoningDone: false,
    tools: [],
    done: false,
  })
}

export function reduceBrowserOsAgentStreamEvent(
  state: BrowserOsAgentStreamState,
  event: UIMessageStreamEvent,
): BrowserOsAgentStreamState {
  switch (event.type) {
    case 'text-delta':
      return withDerivedParts({
        ...state,
        text: state.text + event.delta,
      })
    case 'reasoning-start':
      return withDerivedParts({
        ...state,
        reasoningStarted: true,
        reasoningDone: false,
      })
    case 'reasoning-delta':
      return withDerivedParts({
        ...state,
        reasoningStarted: true,
        reasoningDone: false,
        reasoning: state.reasoning + event.delta,
      })
    case 'reasoning-end':
      return withDerivedParts({
        ...state,
        reasoningStarted: true,
        reasoningDone: true,
      })
    case 'tool-input-start':
      return withDerivedParts({
        ...state,
        tools: upsertTool(state.tools, {
          id: event.toolCallId,
          name: event.toolName,
          status: 'running',
        }),
      })
    case 'tool-output-available':
      return withDerivedParts({
        ...state,
        tools: updateToolStatus(state.tools, event.toolCallId, 'completed'),
      })
    case 'tool-output-error':
      return withDerivedParts({
        ...state,
        tools: updateToolStatus(state.tools, event.toolCallId, 'error'),
      })
    case 'error':
      return withDerivedParts({
        ...state,
        done: true,
        reasoningDone: state.reasoningStarted ? true : state.reasoningDone,
        text: appendErrorText(state.text, event.errorText),
      })
    case 'finish':
      return withDerivedParts({
        ...state,
        done: true,
        reasoningDone: state.reasoningStarted ? true : state.reasoningDone,
      })
    default:
      return state
  }
}

function withDerivedParts(
  state: Omit<BrowserOsAgentStreamState, 'parts'>,
): BrowserOsAgentStreamState {
  return {
    ...state,
    parts: buildAssistantParts(state),
  }
}

function buildAssistantParts(
  state: Omit<BrowserOsAgentStreamState, 'parts'>,
): AssistantPart[] {
  const parts: AssistantPart[] = []
  if (state.reasoningStarted || state.reasoning) {
    parts.push({
      kind: 'thinking',
      text: state.reasoning,
      done: state.reasoningDone,
    })
  }
  if (state.tools.length > 0) {
    parts.push({
      kind: 'tool-batch',
      tools: state.tools,
    })
  }
  if (state.text) {
    parts.push({
      kind: 'text',
      text: state.text,
    })
  }
  return parts
}

function upsertTool(tools: ToolEntry[], tool: ToolEntry): ToolEntry[] {
  const existingIndex = tools.findIndex((entry) => entry.id === tool.id)
  if (existingIndex === -1) {
    return [...tools, tool]
  }
  return tools.map((entry, index) =>
    index === existingIndex ? { ...entry, ...tool } : entry,
  )
}

function updateToolStatus(
  tools: ToolEntry[],
  toolId: string,
  status: ToolEntry['status'],
): ToolEntry[] {
  const existingIndex = tools.findIndex((entry) => entry.id === toolId)
  if (existingIndex === -1) {
    return [
      ...tools,
      {
        id: toolId,
        name: toolId,
        status,
      },
    ]
  }
  return tools.map((entry, index) =>
    index === existingIndex ? { ...entry, status } : entry,
  )
}

function appendErrorText(text: string, errorText: string): string {
  if (!text) {
    return `Error: ${errorText}`
  }
  return `${text}\n\nError: ${errorText}`
}
