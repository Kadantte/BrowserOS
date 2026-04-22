/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFile } from 'node:fs/promises'

export async function readPodmanEnvFile(
  envFilePath?: string,
): Promise<Record<string, string>> {
  if (!envFilePath) return {}
  const content = await readFile(envFilePath, 'utf8')
  return parsePodmanEnvContent(content)
}

export function parsePodmanEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1)
    if (!key) continue
    env[key] = value
  }

  return env
}
