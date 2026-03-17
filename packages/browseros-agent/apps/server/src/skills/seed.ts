import { readdir } from 'node:fs/promises'
import { getSkillsDir } from '../lib/browseros-dir'
import { logger } from '../lib/logger'
import { DEFAULT_SKILLS } from './defaults'
import {
  contentHash,
  installSkill,
  loadManifest,
  saveManifest,
  seedFromRemote,
  writeSkillFile,
} from './remote-sync'

async function hasExistingSkills(skillsDir: string): Promise<boolean> {
  try {
    const entries = await readdir(skillsDir)
    return entries.some((e) => !e.startsWith('.'))
  } catch {
    return false
  }
}

function extractVersion(content: string): string {
  const match = content.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m)
  return match?.[1]?.trim() || '1.0'
}

export async function seedDefaultSkills(): Promise<void> {
  const skillsDir = getSkillsDir()
  if (await hasExistingSkills(skillsDir)) return

  const remoteSucceeded = await seedFromRemote()
  if (remoteSucceeded) return

  const manifest = await loadManifest()
  let seeded = 0

  for (const skill of DEFAULT_SKILLS) {
    try {
      const version = extractVersion(skill.content)
      await writeSkillFile(skill.id, skill.content)
      manifest.skills[skill.id] = {
        version,
        contentHash: contentHash(skill.content),
      }
      seeded++
    } catch (err) {
      logger.warn('Failed to seed skill', {
        id: skill.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (seeded > 0) {
    await saveManifest(manifest)
    logger.info(`Seeded ${seeded} default skills (bundled)`)
  }
}
