/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Custom fetch wrapper for GitHub Copilot API requests.
 * Injects required Copilot headers on every request.
 */

export function createCopilotFetch() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers as HeadersInit)

    // Required Copilot headers (matching OpenCode's implementation)
    headers.set('Openai-Intent', 'conversation-edits')
    headers.set('x-initiator', 'user')

    // Detect vision requests by inspecting the body for image content
    if (init?.body && typeof init.body === 'string') {
      try {
        const json = JSON.parse(init.body)
        if (hasImageContent(json)) {
          headers.set('Copilot-Vision-Request', 'true')
        }
      } catch {
        // Not JSON, skip vision detection
      }
    }

    return fetch(input, { ...init, headers })
  }
}

function hasImageContent(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const obj = body as Record<string, unknown>

  // Chat Completions format: messages[].content[].type === "image_url"
  if (Array.isArray(obj.messages)) {
    for (const msg of obj.messages) {
      if (Array.isArray(msg?.content)) {
        for (const part of msg.content) {
          if (part?.type === 'image_url') return true
        }
      }
    }
  }

  return false
}
