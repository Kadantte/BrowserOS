/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const RUNTIME_STATE_FILE_NAME = 'runtime-state.json'
const openClawRuntimeStateSchema = z
  .object({
    hostGatewayPort: z.number().int().min(1).max(65535).nullable(),
    lastSuccessfulStartAt: z.string().datetime({ offset: true }).nullable(),
    repairGeneration: z.number().int().nonnegative(),
    lastRepairOutcome: z.enum(['success', 'failed']).nullable(),
  })
  .strict()

export type OpenClawRuntimeState = z.infer<typeof openClawRuntimeStateSchema>

export function getOpenClawRuntimeStatePath(openclawDir: string): string {
  return join(openclawDir, RUNTIME_STATE_FILE_NAME)
}

export async function loadOpenClawRuntimeState(
  openclawDir: string,
): Promise<OpenClawRuntimeState | null> {
  try {
    const parsed = JSON.parse(
      await readFile(getOpenClawRuntimeStatePath(openclawDir), 'utf-8'),
    ) as unknown
    const result = openClawRuntimeStateSchema.safeParse(parsed)
    if (!result.success) return null
    return result.data
  } catch {
    return null
  }
}

export async function saveOpenClawRuntimeState(
  openclawDir: string,
  state: OpenClawRuntimeState,
): Promise<void> {
  await mkdir(openclawDir, { recursive: true })
  await writeFile(
    getOpenClawRuntimeStatePath(openclawDir),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf-8',
  )
}
