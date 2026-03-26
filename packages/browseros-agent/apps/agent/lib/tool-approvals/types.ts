export interface ToolCategory {
  id: string
  name: string
  description: string
  tools: string[]
}

export interface ToolApprovalConfig {
  categories: Record<string, boolean>
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'input',
    name: 'Input Actions',
    description: 'Click, type, fill forms, press keys, drag elements',
    tools: [
      'click',
      'click_at',
      'fill',
      'type_at',
      'press_key',
      'select_option',
      'check',
      'uncheck',
      'drag',
      'drag_at',
      'handle_dialog',
      'focus',
      'clear',
    ],
  },
  {
    id: 'navigation',
    name: 'Navigation',
    description: 'Open, close, or navigate pages',
    tools: [
      'navigate_page',
      'new_page',
      'close_page',
      'new_hidden_page',
      'show_page',
    ],
  },
  {
    id: 'screenshots',
    name: 'Screenshots & Capture',
    description: 'Take screenshots, save PDFs, download files',
    tools: ['take_screenshot', 'save_screenshot', 'save_pdf', 'download_file'],
  },
  {
    id: 'scripts',
    name: 'Script Execution',
    description: 'Run JavaScript on pages',
    tools: ['evaluate_script'],
  },
  {
    id: 'data-modification',
    name: 'Data Modification',
    description: 'Bookmarks, history, tab groups',
    tools: [
      'create_bookmark',
      'remove_bookmark',
      'update_bookmark',
      'move_bookmark',
      'delete_history_url',
      'delete_history_range',
    ],
  },
]
