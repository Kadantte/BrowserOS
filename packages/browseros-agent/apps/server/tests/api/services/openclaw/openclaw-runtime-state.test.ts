/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getOpenClawRuntimeStatePath,
  loadOpenClawRuntimeState,
  saveOpenClawRuntimeState,
} from '../../../../src/api/services/openclaw/openclaw-runtime-state'

describe('openclaw runtime state', () => {
  it('returns null when the runtime state file is missing', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'browseros-openclaw-runtime-state-'),
    )

    try {
      await expect(loadOpenClawRuntimeState(tempDir)).resolves.toBeNull()
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('round-trips saved runtime state', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'browseros-openclaw-runtime-state-'),
    )

    try {
      const state = {
        hostGatewayPort: 31234,
        lastSuccessfulStartAt: '2026-04-20T18:00:00.000Z',
        repairGeneration: 7,
        lastRepairOutcome: 'success' as const,
      }

      await saveOpenClawRuntimeState(tempDir, state)

      await expect(loadOpenClawRuntimeState(tempDir)).resolves.toEqual(state)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('writes pretty JSON with a trailing newline', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'browseros-openclaw-runtime-state-'),
    )

    try {
      const state = {
        hostGatewayPort: null,
        lastSuccessfulStartAt: null,
        repairGeneration: 0,
        lastRepairOutcome: null,
      }

      await saveOpenClawRuntimeState(tempDir, state)

      expect(
        fs.readFileSync(getOpenClawRuntimeStatePath(tempDir), 'utf-8'),
      ).toBe(
        '{\n' +
          '  "hostGatewayPort": null,\n' +
          '  "lastSuccessfulStartAt": null,\n' +
          '  "repairGeneration": 0,\n' +
          '  "lastRepairOutcome": null\n' +
          '}\n',
      )
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
