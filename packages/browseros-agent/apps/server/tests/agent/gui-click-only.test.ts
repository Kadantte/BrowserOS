import { describe, expect, it } from 'bun:test'
import { isGuiClickOnlyBrowserToolAllowed } from '../../src/agent/gui-click-only'

describe('GUI click-only browser tool gating', () => {
  it('keeps GUI click and basic page-opening tools available', () => {
    expect(isGuiClickOnlyBrowserToolAllowed('click')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('hover')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('scroll')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('type_text')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('take_screenshot')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('new_page')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('navigate_page')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('list_pages')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('get_active_page')).toBe(true)
    expect(isGuiClickOnlyBrowserToolAllowed('close_page')).toBe(true)
  })

  it('blocks page observation and legacy interaction tools', () => {
    expect(isGuiClickOnlyBrowserToolAllowed('take_snapshot')).toBe(false)
    expect(isGuiClickOnlyBrowserToolAllowed('take_enhanced_snapshot')).toBe(
      false,
    )
    expect(isGuiClickOnlyBrowserToolAllowed('get_dom')).toBe(false)
    expect(isGuiClickOnlyBrowserToolAllowed('get_page_content')).toBe(false)
    expect(isGuiClickOnlyBrowserToolAllowed('click_at')).toBe(false)
    expect(isGuiClickOnlyBrowserToolAllowed('fill')).toBe(false)
    expect(isGuiClickOnlyBrowserToolAllowed('press_key')).toBe(false)
    expect(isGuiClickOnlyBrowserToolAllowed('type_at')).toBe(false)
  })
})
