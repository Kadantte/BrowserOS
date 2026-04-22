/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { LogFn } from './podman-transport'

const MULTIPLEX_HEADER_SIZE = 8
type PodmanByteStream = ReadableStream<Uint8Array<ArrayBufferLike>>

export async function readTextStream(
  stream: PodmanByteStream | null,
  onLine?: LogFn,
): Promise<string> {
  if (!stream) return ''

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    text += chunk
    if (!onLine) continue
    buffer += chunk
    buffer = flushLineBuffer(buffer, onLine)
  }

  const trailing = decoder.decode()
  text += trailing
  if (!onLine) return text
  buffer += trailing
  if (buffer.trim()) onLine(buffer.trim())
  return text
}

export async function readMultiplexedStream(
  stream: PodmanByteStream | null,
  onStdout?: LogFn,
  onStderr?: LogFn,
): Promise<{ stdout: string; stderr: string }> {
  if (!stream) return { stdout: '', stderr: '' }

  const reader = stream.getReader()
  const stdoutDecoder = new TextDecoder()
  const stderrDecoder = new TextDecoder()
  let stdout = ''
  let stderr = ''
  let stdoutBuffer = ''
  let stderrBuffer = ''
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer = concatBytes(buffer, value)

    while (buffer.length >= MULTIPLEX_HEADER_SIZE) {
      const frameSize =
        (buffer[4] << 24) | (buffer[5] << 16) | (buffer[6] << 8) | buffer[7]

      if (buffer.length < MULTIPLEX_HEADER_SIZE + frameSize) break

      const streamType = buffer[0]
      const payload = buffer.slice(
        MULTIPLEX_HEADER_SIZE,
        MULTIPLEX_HEADER_SIZE + frameSize,
      )
      buffer = buffer.slice(MULTIPLEX_HEADER_SIZE + frameSize)

      if (streamType === 2) {
        const decoded = stderrDecoder.decode(payload, { stream: true })
        stderr += decoded
        if (onStderr)
          stderrBuffer = flushLineBuffer(stderrBuffer + decoded, onStderr)
        continue
      }

      const decoded = stdoutDecoder.decode(payload, { stream: true })
      stdout += decoded
      if (onStdout)
        stdoutBuffer = flushLineBuffer(stdoutBuffer + decoded, onStdout)
    }
  }

  stdout += stdoutDecoder.decode()
  stderr += stderrDecoder.decode()
  if (onStdout && stdoutBuffer.trim()) onStdout(stdoutBuffer.trim())
  if (onStderr && stderrBuffer.trim()) onStderr(stderrBuffer.trim())

  return { stdout, stderr }
}

function concatBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  const combined = new Uint8Array(left.length + right.length)
  combined.set(left)
  combined.set(right, left.length)
  return combined
}

function flushLineBuffer(buffer: string, onLine: LogFn): string {
  const lines = buffer.split('\n')
  const trailing = lines.pop() ?? ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) onLine(trimmed)
  }

  return trailing
}
