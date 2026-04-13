import { describe, expect, it } from 'bun:test'
import {
  isAgentCommandPath,
  shouldHideFocusGrid,
  shouldUseChatSession,
} from './route-utils'

describe('route-utils', () => {
  it('treats command center routes as non-chat-session paths', () => {
    expect(isAgentCommandPath('/home')).toBe(true)
    expect(isAgentCommandPath('/home/agents/main')).toBe(true)
    expect(shouldUseChatSession('/home')).toBe(false)
    expect(shouldUseChatSession('/home/agents/main')).toBe(false)
    expect(shouldUseChatSession('/home/chat')).toBe(true)
  })

  it('hides the focus grid on command center and dedicated full-screen routes', () => {
    expect(shouldHideFocusGrid('/home')).toBe(true)
    expect(shouldHideFocusGrid('/home/agents/main')).toBe(true)
    expect(shouldHideFocusGrid('/home/chat')).toBe(true)
    expect(shouldHideFocusGrid('/home/skills')).toBe(true)
    expect(shouldHideFocusGrid('/home/personalize')).toBe(false)
  })
})
