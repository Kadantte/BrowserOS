/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Persistent registry of provider+model combos OpenClaw is allowed to
 * route requests through. Each entry corresponds to one
 * `LlmProviderConfig` from the user's /settings/ai catalog that they
 * explicitly added to OpenClaw via the /agents Models dialog (or via
 * setup, which goes through the same path).
 *
 * Stored at `~/.openclaw/.openclaw/registered-models.json` and loaded
 * lazily on first read; writes are immediate so the gateway never
 * starts up against a stale registry after a restart.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { logger } from '../../../lib/logger'
import {
  getOpenClawRegisteredModelsPath,
  getOpenClawStateDir,
} from './openclaw-env'

export interface RegisteredModelEntry {
  /** Stable id derived from `providerType + modelId`, slugified. */
  id: string
  providerType: string
  providerName?: string
  baseUrl?: string
  /** Bare model id (e.g. `claude-sonnet-4-5`). No provider prefix. */
  modelId: string
  /**
   * Fully-qualified model ref OpenClaw writes into `agents.defaults.*`
   * — e.g. `anthropic/claude-sonnet-4-5` or, for custom providers,
   * the bare model id. Populated at register time so the UI and the
   * server can reconcile the resolved default against the registry
   * entry by exact-string equality (no prefix gymnastics).
   *
   * Optional on disk for backwards compat with pre-modelRef entries;
   * call sites fall back to building the ref on the fly when missing.
   */
  modelRef?: string
  supportsImages: boolean
  addedAt: number
}

export interface RegisteredModelInput {
  providerType: string
  providerName?: string
  baseUrl?: string
  modelId: string
  /** See `RegisteredModelEntry.modelRef`. */
  modelRef?: string
  supportsImages: boolean
}

/**
 * Build a deterministic id for a `(providerType, modelId)` pair so the
 * UI can refer to a registered entry without exposing the API key or
 * the catalog id from /settings/ai.
 */
export function buildRegisteredModelId(
  providerType: string,
  modelId: string,
): string {
  const slug = `${providerType}-${modelId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || `${providerType}-${modelId}`
}

export class RegisteredModelsStore {
  constructor(private readonly openclawDir: string) {}

  private getPath(): string {
    return getOpenClawRegisteredModelsPath(this.openclawDir)
  }

  async list(): Promise<RegisteredModelEntry[]> {
    const path = this.getPath()
    if (!existsSync(path)) return []
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isValidEntry)
    } catch (err) {
      logger.warn('Failed to read registered-models.json — treating as empty', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  async upsert(input: RegisteredModelInput): Promise<RegisteredModelEntry> {
    const id = buildRegisteredModelId(input.providerType, input.modelId)
    const existing = await this.list()
    const next = existing.filter((entry) => entry.id !== id)
    const entry: RegisteredModelEntry = {
      id,
      providerType: input.providerType,
      providerName: input.providerName,
      baseUrl: input.baseUrl,
      modelId: input.modelId,
      modelRef: input.modelRef,
      supportsImages: !!input.supportsImages,
      addedAt: Date.now(),
    }
    next.push(entry)
    await this.write(next)
    return entry
  }

  async remove(id: string): Promise<{
    removed: RegisteredModelEntry | null
    remaining: RegisteredModelEntry[]
  }> {
    const existing = await this.list()
    const removed = existing.find((entry) => entry.id === id) ?? null
    const remaining = existing.filter((entry) => entry.id !== id)
    if (removed) await this.write(remaining)
    return { removed, remaining }
  }

  async findById(id: string): Promise<RegisteredModelEntry | null> {
    const all = await this.list()
    return all.find((entry) => entry.id === id) ?? null
  }

  private async write(entries: RegisteredModelEntry[]): Promise<void> {
    const path = this.getPath()
    await mkdir(dirname(path), { recursive: true })
    // We control both the writer and reader and the file lives only on
    // the user's machine — no need for atomic-rename gymnastics.
    await writeFile(path, JSON.stringify(entries, null, 2), { mode: 0o600 })
  }

  /**
   * Ensure the parent state directory exists before any operation. The
   * service already creates this during `setup()`, but call sites that
   * touch the registry before/after setup can lean on this helper.
   */
  async ensureDir(): Promise<void> {
    await mkdir(getOpenClawStateDir(this.openclawDir), { recursive: true })
  }
}

function isValidEntry(value: unknown): value is RegisteredModelEntry {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.providerType === 'string' &&
    typeof v.modelId === 'string' &&
    typeof v.supportsImages === 'boolean' &&
    typeof v.addedAt === 'number'
  )
}
