import { Buffer } from 'node:buffer'
import { logger } from '../lib/logger'
import {
  MOLMO_POINT_ENDPOINT,
  MOLMO_POINT_MAX_NEW_TOKENS,
  MOLMO_POINT_TIMEOUT_MS,
} from './molmo-point-config'

interface MolmoPoint {
  object_id?: unknown
  image_num?: unknown
  x?: unknown
  y?: unknown
}

interface MolmoPointResponse {
  text?: unknown
  points?: unknown
}

export interface ClickPoint {
  x: number
  y: number
}

export interface PngDimensions {
  width: number
  height: number
}

const MOLMO_POINT_RESPONSE_LOG_MAX_CHARS = 2_000
const MOLMO_POINT_ERROR_BODY_MAX_CHARS = 500
const MOLMO_POINT_INSTRUCTION_LOG_MAX_CHARS = 1_000

function pointUrl(): string {
  return new URL('/point', MOLMO_POINT_ENDPOINT).toString()
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}... (+${text.length - maxChars} chars)`
}

function firstValidPoint(points: unknown): ClickPoint | null {
  if (!Array.isArray(points)) return null

  for (const rawPoint of points) {
    const point = rawPoint as MolmoPoint
    if (typeof point.x !== 'number' || typeof point.y !== 'number') continue
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    return { x: point.x, y: point.y }
  }

  return null
}

export async function requestMolmoPoint(args: {
  instruction: string
  imageB64: string
}): Promise<ClickPoint> {
  const endpoint = pointUrl()
  const instruction = truncateText(
    args.instruction,
    MOLMO_POINT_INSTRUCTION_LOG_MAX_CHARS,
  )
  const instructionLength = args.instruction.length
  const instructionTruncated =
    instructionLength > MOLMO_POINT_INSTRUCTION_LOG_MAX_CHARS

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      instruction: args.instruction,
      image_b64: args.imageB64,
      max_new_tokens: MOLMO_POINT_MAX_NEW_TOKENS,
    }),
    signal: AbortSignal.timeout(MOLMO_POINT_TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.warn('Molmo point request failed', {
      endpoint,
      instruction,
      instructionLength,
      instructionTruncated,
      status: response.status,
      statusText: response.statusText,
      rawResponseText: truncateText(body, MOLMO_POINT_RESPONSE_LOG_MAX_CHARS),
      rawResponseTextLength: body.length,
      rawResponseTextTruncated:
        body.length > MOLMO_POINT_RESPONSE_LOG_MAX_CHARS,
    })
    const suffix = body
      ? `: ${truncateText(body, MOLMO_POINT_ERROR_BODY_MAX_CHARS)}`
      : ''
    throw new Error(`Molmo point request failed (${response.status})${suffix}`)
  }

  const rawResponseText = await response.text()
  let payload: MolmoPointResponse
  try {
    payload = JSON.parse(rawResponseText) as MolmoPointResponse
  } catch (error) {
    logger.warn('Molmo point response parse failed', {
      endpoint,
      instruction,
      instructionLength,
      instructionTruncated,
      status: response.status,
      statusText: response.statusText,
      rawResponseText: truncateText(
        rawResponseText,
        MOLMO_POINT_RESPONSE_LOG_MAX_CHARS,
      ),
      rawResponseTextLength: rawResponseText.length,
      rawResponseTextTruncated:
        rawResponseText.length > MOLMO_POINT_RESPONSE_LOG_MAX_CHARS,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  const point = firstValidPoint(payload.points)
  if (!point) {
    throw new Error('Molmo point response did not include a valid point')
  }

  return point
}

export function getPngDimensionsFromBase64(
  imageB64: string,
): PngDimensions | null {
  const buffer = Buffer.from(imageB64, 'base64')
  if (buffer.length < 24) return null

  const pngSignature = '89504e470d0a1a0a'
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) return null

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}
