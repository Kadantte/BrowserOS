/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OpenClawRuntimeState {
  hostGatewayPort: number | null
  lastSuccessfulStartAt: string | null
  repairGeneration: number
  lastRepairOutcome: 'success' | 'failed' | null
}

const RUNTIME_STATE_FILE_NAME = 'runtime-state.json'

export function getOpenClawRuntimeStatePath(openclawDir: string): string {
  return join(openclawDir, RUNTIME_STATE_FILE_NAME)
}

export async function loadOpenClawRuntimeState(
  openclawDir: string,
): Promise<OpenClawRuntimeState | null> {
  try {
    const parsed = JSON.parse(
      await readFile(getOpenClawRuntimeStatePath(openclawDir), 'utf-8'),
    ) as Partial<OpenClawRuntimeState>
    return {
      hostGatewayPort:
        typeof parsed.hostGatewayPort === 'number'
          ? parsed.hostGatewayPort
          : null,
      lastSuccessfulStartAt:
        typeof parsed.lastSuccessfulStartAt === 'string'
          ? parsed.lastSuccessfulStartAt
          : null,
      repairGeneration:
        typeof parsed.repairGeneration === 'number'
          ? parsed.repairGeneration
          : 0,
      lastRepairOutcome:
        parsed.lastRepairOutcome === 'success' ||
        parsed.lastRepairOutcome === 'failed'
          ? parsed.lastRepairOutcome
          : null,
    }
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
