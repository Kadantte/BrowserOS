import { APICallError } from '@ai-sdk/provider'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getOpenRouterErrorMessage(parsed: unknown, fallback: string): string {
  if (!isRecord(parsed) || !isRecord(parsed.error)) return fallback

  let message =
    typeof parsed.error.message === 'string' ? parsed.error.message : fallback

  if (parsed.error.code !== undefined) {
    message = `[${String(parsed.error.code)}] ${message}`
  }

  const metadata = isRecord(parsed.error.metadata)
    ? parsed.error.metadata
    : undefined
  if (metadata?.raw !== undefined) {
    message += ` (${JSON.stringify(metadata.raw)})`
  }

  return message
}

function getOpenRouterErrorStatus(parsed: unknown, fallback: number): number {
  if (!isRecord(parsed) || !isRecord(parsed.error)) return fallback
  return typeof parsed.error.code === 'number' ? parsed.error.code : fallback
}

function sanitizeReasoningReplay(
  options?: RequestInit,
): RequestInit | undefined {
  if (typeof options?.body !== 'string') return options

  let body: unknown
  try {
    body = JSON.parse(options.body)
  } catch {
    return options
  }

  if (!isRecord(body) || !Array.isArray(body.messages)) return options

  let changed = false
  const messages = body.messages.map((message) => {
    if (
      !isRecord(message) ||
      message.role !== 'assistant' ||
      !Array.isArray(message.reasoning_details) ||
      message.reasoning_details.length === 0 ||
      (!('reasoning' in message) && !('reasoning_content' in message))
    ) {
      return message
    }

    const {
      reasoning: _reasoning,
      reasoning_content: _reasoningContent,
      ...rest
    } = message
    changed = true
    return rest
  })

  if (!changed) return options

  return {
    ...options,
    body: JSON.stringify({
      ...body,
      messages,
    }),
  }
}

/**
 * Creates a fetch function that extracts detailed error messages from OpenRouter-style APIs.
 *
 * OpenRouter (and BrowserOS which uses it internally) wraps provider errors in a generic
 * "Provider returned error" message, with actual details hidden in metadata.raw.
 * This fetch intercepts HTTP errors and extracts the real error message.
 *
 * IMPORTANT: Throws APICallError (not plain Error) so the Vercel AI SDK's retry mechanism
 * works correctly. The SDK's APICallError automatically calculates `isRetryable` from
 * the statusCode (408, 409, 429, 500+ are retryable) - we don't override this default.
 */
export function createOpenRouterCompatibleFetch(): typeof fetch {
  return (async (url: RequestInfo | URL, options?: RequestInit) => {
    const response = await globalThis.fetch(
      url,
      sanitizeReasoningReplay(options),
    )
    let responseBody: string | undefined
    let parsedResponseBody: unknown

    if (!response.ok) {
      const statusCode = response.status
      let errorMessage = `HTTP ${statusCode}: ${response.statusText}`

      try {
        responseBody = await response.clone().text()
        parsedResponseBody = JSON.parse(responseBody)
        errorMessage = getOpenRouterErrorMessage(
          parsedResponseBody,
          errorMessage,
        )
      } catch {
        // Keep default error message if parsing fails
      }

      throw new APICallError({
        message: errorMessage,
        url: typeof url === 'string' ? url : url.toString(),
        requestBodyValues: {},
        statusCode,
        responseBody,
      })
    }

    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        responseBody = await response.clone().text()
        parsedResponseBody = JSON.parse(responseBody)
      } catch {
        parsedResponseBody = undefined
      }

      if (isRecord(parsedResponseBody) && isRecord(parsedResponseBody.error)) {
        throw new APICallError({
          message: getOpenRouterErrorMessage(
            parsedResponseBody,
            'Provider returned error',
          ),
          url: typeof url === 'string' ? url : url.toString(),
          requestBodyValues: {},
          statusCode: getOpenRouterErrorStatus(parsedResponseBody, 400),
          responseBody,
        })
      }
    }

    return response
  }) as typeof fetch
}
