import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { RemoteSkillCatalog, RemoteSkillEntry } from '../apps/server/src/skills/types'

const DEFAULTS_DIR = join(
  import.meta.dir,
  '../apps/server/src/skills/defaults',
)

function extractVersion(content: string): string {
  const match = content.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m)
  return match?.[1]?.trim() || '1.0'
}

export async function generateCatalog(): Promise<RemoteSkillCatalog> {
  const entries = await readdir(DEFAULTS_DIR)
  const skills: RemoteSkillEntry[] = []

  for (const entry of entries) {
    const entryPath = join(DEFAULTS_DIR, entry)
    const info = await stat(entryPath)
    if (!info.isDirectory()) continue

    const skillPath = join(entryPath, 'SKILL.md')
    try {
      const content = await readFile(skillPath, 'utf-8')
      skills.push({ id: entry, version: extractVersion(content), content })
    } catch {
      console.error(`Skipping ${entry}: no SKILL.md found`)
    }
  }

  skills.sort((a, b) => a.id.localeCompare(b.id))
  return { version: 1, skills }
}
