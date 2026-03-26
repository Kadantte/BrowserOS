import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider'
import { type ToolSet, tool } from 'ai'
import { logger } from '../lib/logger'
import { metrics } from '../lib/metrics'
import { executeTool, type ToolContext } from '../tools/framework'
import type { ContentItem } from '../tools/response'
import type { ToolRegistry } from '../tools/tool-registry'

function contentToModelOutput(
  content: ContentItem[],
): LanguageModelV2ToolResultOutput {
  const hasImages = content.some((c) => c.type === 'image')

  if (!hasImages) {
    const text = content
      .filter((c): c is ContentItem & { type: 'text' } => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
    return { type: 'text', value: text || 'Success' }
  }

  return {
    type: 'content',
    value: content.map((c) => {
      if (c.type === 'text') {
        return { type: 'text' as const, text: c.text }
      }
      return {
        type: 'media' as const,
        data: c.data,
        mediaType: c.mimeType,
      }
    }),
  }
}

const TOOL_CATEGORY_MAP: Record<string, string[]> = {
  input: [
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
  navigation: [
    'navigate_page',
    'new_page',
    'close_page',
    'new_hidden_page',
    'show_page',
  ],
  screenshots: [
    'take_screenshot',
    'save_screenshot',
    'save_pdf',
    'download_file',
  ],
  scripts: ['evaluate_script'],
  'data-modification': [
    'create_bookmark',
    'remove_bookmark',
    'update_bookmark',
    'move_bookmark',
    'delete_history_url',
    'delete_history_range',
  ],
}

function buildApprovalSet(config?: {
  categories: Record<string, boolean>
}): Set<string> {
  const set = new Set<string>()
  if (!config) return set
  for (const [categoryId, tools] of Object.entries(TOOL_CATEGORY_MAP)) {
    if (config.categories[categoryId]) {
      for (const t of tools) set.add(t)
    }
  }
  return set
}

export function buildBrowserToolSet(
  registry: ToolRegistry,
  ctx: ToolContext,
  approvalConfig?: { categories: Record<string, boolean> },
): ToolSet {
  const toolSet: ToolSet = {}
  const toolsNeedingApproval = buildApprovalSet(approvalConfig)

  for (const def of registry.all()) {
    toolSet[def.name] = tool({
      description: def.description,
      inputSchema: def.input,
      needsApproval: toolsNeedingApproval.has(def.name),
      execute: async (params) => {
        const startTime = performance.now()
        try {
          const result = await executeTool(
            def,
            params,
            ctx,
            AbortSignal.timeout(120_000),
          )

          metrics.log('tool_executed', {
            tool_name: def.name,
            duration_ms: Math.round(performance.now() - startTime),
            success: !result.isError,
            source: 'chat',
          })

          return {
            content: result.content,
            isError: result.isError ?? false,
            metadata: result.metadata,
          }
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error)

          logger.error('Tool execution failed', {
            tool: def.name,
            error: errorText,
          })
          metrics.log('tool_executed', {
            tool_name: def.name,
            duration_ms: Math.round(performance.now() - startTime),
            success: false,
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            source: 'chat',
          })

          return {
            content: [{ type: 'text' as const, text: errorText }],
            isError: true,
          }
        }
      },
      toModelOutput: ({ output }) => {
        const result = output as {
          content: ContentItem[]
          isError: boolean
        }
        if (result.isError) {
          const text = result.content
            .filter(
              (c): c is ContentItem & { type: 'text' } => c.type === 'text',
            )
            .map((c) => c.text)
            .join('\n')
          return { type: 'error-text', value: text }
        }
        if (!result.content?.length) {
          return { type: 'text', value: 'Success' }
        }
        return contentToModelOutput(result.content)
      },
    })
  }

  return toolSet
}
