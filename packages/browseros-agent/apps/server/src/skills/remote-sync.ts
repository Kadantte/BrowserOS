import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TIMEOUTS } from '@browseros/shared/constants/timeouts'
import { EXTERNAL_URLS } from '@browseros/shared/constants/urls'
import { INLINED_ENV } from '../env'
import { getBuiltinSkillsDir } from '../lib/browseros-dir'
import { logger } from '../lib/logger'
import { DEFAULT_SKILLS } from './defaults'
import { safeBuiltinSkillDir } from './service'
import type { RemoteSkillCatalog, RemoteSkillEntry } from './types'

let syncTimer: ReturnType<typeof setInterval> | null = null

function extractVersion(content: string): string {
  const match = content.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m)
  return match?.[1]?.trim() || '1.0'
}

function extractEnabled(content: string): string | null {
  const match = content.match(/^\s*enabled:\s*["']?(true|false)["']?/m)
  return match?.[1] ?? null
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

function getCatalogUrl(): string {
  return INLINED_ENV.SKILLS_CATALOG_URL || EXTERNAL_URLS.SKILLS_CATALOG
}

export async function fetchRemoteCatalog(): Promise<RemoteSkillCatalog | null> {
  try {
    const response = await fetch(getCatalogUrl(), {
      signal: AbortSignal.timeout(TIMEOUTS.SKILLS_FETCH),
    })
    if (!response.ok) {
      logger.warn('Failed to fetch remote skill catalog', { status: response.status })
      return null
    }
    const data: unknown = await response.json()
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

async function readLocalFile(skillId: string): Promise<string | null> {
  try {
    return await readFile(join(safeBuiltinSkillDir(skillId), 'SKILL.md'), 'utf-8')
  } catch {
    return null
  }
}

async function writeSkillFile(skillId: string, content: string): Promise<void> {
  const dir = safeBuiltinSkillDir(skillId)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), content)
}

async function applyEnabled(skillId: string, enabled: string): Promise<void> {
  const filePath = join(safeBuiltinSkillDir(skillId), 'SKILL.md')
  let content = await readFile(filePath, 'utf-8')
  content = content.replace(
    /^(\s*enabled:\s*)["']?(?:true|false)["']?/m,
    `$1"${enabled}"`,
  )
  await writeFile(filePath, content)
}

async function skillExistsLocally(skillId: string): Promise<boolean> {
  try {
    await stat(join(safeBuiltinSkillDir(skillId), 'SKILL.md'))
    return true
  } catch {
    return false
  }
}

async function reconcileRemovedSkills(catalogIds: Set<string>): Promise<number> {
  const builtinDir = getBuiltinSkillsDir()
  let entries: string[]
  try {
    entries = await readdir(builtinDir)
  } catch {
    return 0
  }

  let removed = 0
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const entryPath = join(builtinDir, entry)
    try {
      const s = await stat(entryPath)
      if (!s.isDirectory()) continue
    } catch {
      continue
    }

    if (!catalogIds.has(entry)) {
      try {
        await rm(entryPath, { recursive: true })
        removed++
      } catch (err) {
        logger.warn('Failed to remove obsolete builtin skill', {
          id: entry,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
  return removed
}

export async function syncBuiltinSkills(): Promise<void> {
  const catalog = await fetchRemoteCatalog()
  const syncedIds = new Set<string>()

  if (catalog) {
    for (const remoteSkill of catalog.skills) {
      try {
        const localContent = await readLocalFile(remoteSkill.id)

        if (localContent && extractVersion(localContent) === remoteSkill.version) {
          syncedIds.add(remoteSkill.id)
          continue
        }

        const localEnabled = localContent ? extractEnabled(localContent) : null

        await writeSkillFile(remoteSkill.id, remoteSkill.content)

        if (localEnabled === 'false') {
          await applyEnabled(remoteSkill.id, 'false')
        }

        syncedIds.add(remoteSkill.id)
      } catch (err) {
        logger.warn('Failed to sync skill from remote', {
          id: remoteSkill.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (catalog.skills.length > 0) {
      const removed = await reconcileRemovedSkills(
        new Set(catalog.skills.map((s) => s.id)),
      )
      if (removed > 0) {
        logger.info(`Removed ${removed} obsolete built-in skills`)
      }
    }
  }

  let bundled = 0
  for (const skill of DEFAULT_SKILLS) {
    if (syncedIds.has(skill.id)) continue
    if (await skillExistsLocally(skill.id)) continue

    try {
      await writeSkillFile(skill.id, skill.content)
      bundled++
    } catch (err) {
      logger.warn('Failed to write bundled skill', {
        id: skill.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (bundled > 0) {
    logger.info(`Installed ${bundled} built-in skills from bundled defaults`)
  }
}

export function startSkillSync(): void {
  if (syncTimer) return
  syncTimer = setInterval(() => {
    syncBuiltinSkills().catch((err) => {
      logger.warn('Skill sync failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }, TIMEOUTS.SKILLS_SYNC_INTERVAL)
  syncTimer.unref()
}

export function stopSkillSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}
