export const GUI_CLICK_ONLY_MODE = true

export const GUI_CLICK_ONLY_BROWSER_TOOL_NAMES = new Set([
  'click',
  'hover',
  'scroll',
  'type_text',
  'get_active_page',
  'list_pages',
  'navigate_page',
  'new_page',
  'close_page',
])

export function isGuiClickOnlyBrowserToolAllowed(name: string): boolean {
  return GUI_CLICK_ONLY_BROWSER_TOOL_NAMES.has(name)
}
