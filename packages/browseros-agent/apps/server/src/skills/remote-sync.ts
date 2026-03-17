import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SKILLS_LIMITS } from '@browseros/shared/constants/limits'
import { TIMEOUTS } from '@browseros/shared/constants/timeouts'
import { EXTERNAL_URLS } from '@browseros/shared/constants/urls'
import { INLINED_ENV } from '../env'
import { getSkillsDir } from '../lib/browseros-dir'
import { logger } from '../lib/logger'
import { safeSkillDir } from './service'
import type {
  ManagedSkillRecord,
  RemoteSkillCatalog,
  RemoteSkillEntry,
  SkillManifest,
} from './types'

export const MANIFEST_FILE = '.remote-manifest.json'

let syncTimer: ReturnType<typeof setInterval> | null = null

export function extractVersion(content: string): string {
  const match = content.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m)
  return match?.[1]?.trim() || '1.0'
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function getManifestPath(): string {
  return join(getSkillsDir(), MANIFEST_FILE)
}

function isValidManifest(data: unknown): data is SkillManifest {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return typeof d.lastSyncedAt === 'string' && typeof d.skills === 'object' && d.skills !== null
}

function isValidSkillEntry(entry: unknown): entry is RemoteSkillEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.version === 'string' &&
    typeof e.content === 'string'
  )
}

function isValidCatalog(data: unknown): data is RemoteSkillCatalog {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.version === 'number' &&
    Array.isArray(d.skills) &&
    d.skills.every(isValidSkillEntry)
  )
}

export async function loadManifest(): Promise<SkillManifest> {
  try {
    const raw = await readFile(getManifestPath(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!isValidManifest(parsed)) {
      logger.warn('Invalid manifest file, resetting')
      return { lastSyncedAt: '', skills: {} }
    }
    return parsed
  } catch {
    return { lastSyncedAt: '', skills: {} }
  }
}

export async function saveManifest(manifest: SkillManifest): Promise<void> {
  await writeFile(getManifestPath(), JSON.stringify(manifest, null, 2))
}

function getCatalogUrl(): string {
  return INLINED_ENV.SKILLS_CATALOG_URL || EXTERNAL_URLS.SKILLS_CATALOG
}

export async function fetchRemoteCatalog(): Promise<RemoteSkillCatalog | null> {
  try {
    const response = await fetch(getCatalogUrl(), {
      signal: AbortSignal.timeout(TIMEOUTS.SKILLS_FETCH),
    })
    if (!response.ok) {
      logger.warn('Failed to fetch remote skill catalog', {
        status: response.status,
      })
      return null
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > SKILLS_LIMITS.MAX_CATALOG_BYTES) {
      logger.warn('Remote skill catalog Content-Length too large', {
        contentLength,
      })
      return null
    }
    const text = await response.text()
    if (text.length > SKILLS_LIMITS.MAX_CATALOG_BYTES) {
      logger.warn('Remote skill catalog response too large', {
        size: text.length,
      })
      return null
    }
    const data: unknown = JSON.parse(text)
    if (!isValidCatalog(data)) {
      logger.warn('Remote skill catalog has invalid format')
      return null
    }
    return data
  } catch (err) {
    logger.debug('Remote skill catalog unavailable', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function isSkillCustomized(
  skillId: string,
  currentContent: string,
  manifest: SkillManifest,
): boolean {
  const record = manifest.skills[skillId]
  if (!record) return false
  return contentHash(currentContent) !== record.contentHash
}

async function readSkillContent(skillId: string): Promise<string | null> {
  try {
    const safeDir = safeSkillDir(skillId)
    return await readFile(join(safeDir, 'SKILL.md'), 'utf-8')
  } catch {
    return null
  }
}

export async function writeSkillFile(
  skillId: string,
  content: string,
): Promise<void> {
  const safeDir = safeSkillDir(skillId)
  await mkdir(safeDir, { recursive: true })
  await writeFile(join(safeDir, 'SKILL.md'), content)
}

export async function installSkill(
  skill: RemoteSkillEntry,
  manifest: SkillManifest,
): Promise<void> {
  await writeSkillFile(skill.id, skill.content)
  manifest.skills[skill.id] = {
    version: skill.version,
    contentHash: contentHash(skill.content),
  }
}

export async function syncRemoteSkills(): Promise<{
  installed: number
  updated: number
  skipped: number
}> {
  const result = { installed: 0, updated: 0, skipped: 0 }
  const catalog = await fetchRemoteCatalog()
  if (!catalog) return result

  const manifest = await loadManifest()

  for (const remoteSkill of catalog.skills) {
    try {
      const localContent = await readSkillContent(remoteSkill.id)
      const localRecord: ManagedSkillRecord | undefined =
        manifest.skills[remoteSkill.id]

      if (!localContent) {
        await installSkill(remoteSkill, manifest)
        result.installed++
        continue
      }

      if (!localRecord) {
        result.skipped++
        continue
      }

      if (localRecord.version === remoteSkill.version) {
        continue
      }

      if (isSkillCustomized(remoteSkill.id, localContent, manifest)) {
        result.skipped++
        continue
      }

      await installSkill(remoteSkill, manifest)
      result.updated++
    } catch (err) {
      logger.warn('Failed to sync skill', {
        id: remoteSkill.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (result.installed > 0 || result.updated > 0) {
    manifest.lastSyncedAt = new Date().toISOString()
    await saveManifest(manifest)
  }

  return result
}

export async function seedFromRemote(): Promise<boolean> {
  const catalog = await fetchRemoteCatalog()
  if (!catalog || catalog.skills.length === 0) return false

  const manifest = await loadManifest()
  let seeded = 0

  for (const skill of catalog.skills) {
    try {
      await installSkill(skill, manifest)
      seeded++
    } catch (err) {
      logger.warn('Failed to seed remote skill', {
        id: skill.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (seeded === 0) return false

  manifest.lastSyncedAt = new Date().toISOString()
  await saveManifest(manifest)
  logger.info(`Seeded ${seeded}/${catalog.skills.length} skills from remote catalog`)

  return seeded === catalog.skills.length
}

export function startSkillSync(): void {
  if (syncTimer) return

  syncTimer = setInterval(async () => {
    try {
      const { installed, updated, skipped } = await syncRemoteSkills()
      if (installed > 0 || updated > 0) {
        logger.info('Remote skill sync completed', {
          installed,
          updated,
          skipped,
        })
      }
    } catch (err) {
      logger.warn('Skill sync failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, TIMEOUTS.SKILLS_SYNC_INTERVAL)

  syncTimer.unref()
}

export function stopSkillSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}
