import { LLM_PROVIDERS } from '@browseros/shared/schemas/llm'
import type {
  FilePart,
  ImagePart,
  ModelMessage,
  ToolModelMessage,
  ToolResultPart,
  UserContent,
  UserModelMessage,
} from 'ai'
import { stripToolResultOutput } from './compaction/content'
import type { ResolvedAgentConfig } from './types'

type ToolResultOutput = ToolResultPart['output']
type ToolResultContentPart = Extract<
  ToolResultOutput,
  { type: 'content' }
>['value'][number]
type UserMessagePart = Exclude<UserContent, string>[number]
type UserMediaPart = Extract<UserMessagePart, ImagePart | FilePart>

const MAX_SCREENSHOTS_IN_MODEL_HISTORY = 3
const SCREENSHOT_HISTORY_PLACEHOLDER =
  '<screenshot omitted from context: keeping latest 3 screenshots>'

export interface MessageNormalizationOptions {
  supportsImages: boolean
  supportsMediaInToolResults: boolean
}

// See how opencode handles, inspiration from there
// https://github.com/anomalyco/opencode/blob/5ec5d1daceaab23c8ffa9ae32b40f53120f4609e/packages/opencode/src/session/message-v2.ts#L503-L522
function supportsToolResultMediaTransport(
  config: ResolvedAgentConfig,
): boolean {
  switch (config.provider) {
    case LLM_PROVIDERS.ANTHROPIC:
    case LLM_PROVIDERS.OPENAI:
    case LLM_PROVIDERS.AZURE:
    case LLM_PROVIDERS.BEDROCK:
      return true
    case LLM_PROVIDERS.GOOGLE: {
      const modelId = config.model.toLowerCase()
      return modelId.includes('gemini-3') && !modelId.includes('gemini-2')
    }
    case LLM_PROVIDERS.BROWSEROS:
      return (
        config.upstreamProvider === LLM_PROVIDERS.ANTHROPIC ||
        config.upstreamProvider === LLM_PROVIDERS.AZURE
      )
    default:
      return false
  }
}

export function getMessageNormalizationOptions(
  config: ResolvedAgentConfig,
): MessageNormalizationOptions {
  return {
    supportsImages: config.supportsImages !== false,
    supportsMediaInToolResults: supportsToolResultMediaTransport(config),
  }
}

function buildToolResultMediaLabel(parts: UserMediaPart[]): string {
  const imageCount = parts.filter(
    (part) =>
      part.type === 'image' ||
      (part.type === 'file' && part.mediaType.startsWith('image/')),
  ).length

  if (imageCount === parts.length) {
    return 'Attached image(s) from tool result:'
  }

  if (imageCount === 0) {
    return 'Attached file(s) from tool result:'
  }

  return 'Attached files from tool result:'
}

function toolResultContentPartToUserMedia(
  part: ToolResultContentPart,
): UserMediaPart | null {
  switch (part.type) {
    case 'media':
    case 'image-data':
      if (part.mediaType.startsWith('image/')) {
        return {
          type: 'image',
          image: part.data,
          mediaType: part.mediaType,
        }
      }
      return {
        type: 'file',
        data: part.data,
        mediaType: part.mediaType,
      }
    case 'file-data':
      if (part.mediaType.startsWith('image/')) {
        return {
          type: 'image',
          image: part.data,
          mediaType: part.mediaType,
        }
      }
      return {
        type: 'file',
        data: part.data,
        mediaType: part.mediaType,
        filename: part.filename,
      }
    default:
      return null
  }
}

function isScreenshotToolResult(part: ToolResultPart): boolean {
  return (
    part.type === 'tool-result' &&
    typeof part.toolName === 'string' &&
    (part.toolName.includes('screenshot') || part.toolName === 'snapshot')
  )
}

function isImageToolResultContentPart(part: ToolResultContentPart): boolean {
  switch (part.type) {
    case 'media':
    case 'image-data':
    case 'file-data':
      return part.mediaType.startsWith('image/')
    case 'image-url':
    case 'image-file-id':
      return true
    default:
      return false
  }
}

function pruneScreenshotHistory(messages: ModelMessage[]): ModelMessage[] {
  let remainingScreenshots = MAX_SCREENSHOTS_IN_MODEL_HISTORY
  let changed = false
  const pruned = [...messages]

  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex]
    if (message.role !== 'tool') continue

    let messageChanged = false
    const content = [...message.content]

    for (let partIndex = content.length - 1; partIndex >= 0; partIndex--) {
      const part = content[partIndex]
      if (
        part.type !== 'tool-result' ||
        part.output.type !== 'content' ||
        !isScreenshotToolResult(part)
      ) {
        continue
      }

      let partChanged = false
      const value = [...part.output.value]

      for (let valueIndex = value.length - 1; valueIndex >= 0; valueIndex--) {
        if (!isImageToolResultContentPart(value[valueIndex])) continue

        if (remainingScreenshots > 0) {
          remainingScreenshots--
          continue
        }

        value[valueIndex] = {
          type: 'text',
          text: SCREENSHOT_HISTORY_PLACEHOLDER,
        }
        partChanged = true
      }

      if (!partChanged) continue

      content[partIndex] = {
        ...part,
        output: { ...part.output, value },
      }
      messageChanged = true
    }

    if (!messageChanged) continue

    pruned[messageIndex] = { ...message, content }
    changed = true
  }

  return changed ? pruned : messages
}

function normalizeToolMessageForModel(
  message: ToolModelMessage,
  supportsImages: boolean,
): ModelMessage[] {
  let extractedMedia: UserMediaPart[] = []
  let changed = false

  const content = message.content.map((part) => {
    if (part.type !== 'tool-result' || part.output.type !== 'content') {
      return part
    }

    changed = true

    if (supportsImages) {
      extractedMedia = [
        ...extractedMedia,
        ...part.output.value
          .map(toolResultContentPartToUserMedia)
          .filter(
            (mediaPart): mediaPart is UserMediaPart => mediaPart !== null,
          ),
      ]
    }

    return {
      ...part,
      output: stripToolResultOutput(part.output),
    }
  })

  if (!changed) {
    return [message]
  }

  const normalizedToolMessage: ToolModelMessage = {
    ...message,
    content,
  }

  if (extractedMedia.length === 0) {
    return [normalizedToolMessage]
  }

  const mediaMessage: UserModelMessage = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: buildToolResultMediaLabel(extractedMedia),
      },
      ...extractedMedia,
    ],
  }

  return [normalizedToolMessage, mediaMessage]
}

// opencode handles this at message serialization time for providers that do not
// reliably support media inside tool results. BrowserOS uses the same boundary:
// normalize model messages before the next step, not inside the screenshot tool.
export function normalizeMessagesForModel(
  messages: ModelMessage[],
  options: MessageNormalizationOptions,
): ModelMessage[] {
  const screenshotPrunedMessages = pruneScreenshotHistory(messages)

  if (options.supportsMediaInToolResults) {
    return screenshotPrunedMessages
  }

  let changed = false
  const normalized: ModelMessage[] = []

  for (const message of screenshotPrunedMessages) {
    if (message.role !== 'tool') {
      normalized.push(message)
      continue
    }

    const replacement = normalizeToolMessageForModel(
      message,
      options.supportsImages,
    )
    if (replacement.length !== 1 || replacement[0] !== message) {
      changed = true
    }
    normalized.push(...replacement)
  }

  return changed ? normalized : screenshotPrunedMessages
}
