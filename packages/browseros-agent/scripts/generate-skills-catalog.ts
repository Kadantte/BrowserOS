/**
 * Generates a skills catalog JSON from bundled default skills.
 *
 * Usage:
 *   bun scripts/generate-skills-catalog.ts                  # stdout
 *   bun scripts/generate-skills-catalog.ts -o catalog.json  # write to file
 *
 * The output can be hosted on any static file server, CDN, or S3 bucket.
 * The server fetches this at SKILLS_CATALOG_URL (or skills.browseros.com).
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULTS_DIR = join(
  import.meta.dir,
  '../apps/server/src/skills/defaults',
)

type CatalogSkill = {
  id: string
  version: string
  content: string
}

function extractVersion(content: string): string {
  const match = content.match(/^\s*version:\s*["']?([^"'\n]+)["']?/m)
  return match?.[1]?.trim() || '1.0'
}

async function generateCatalog(): Promise<string> {
  const entries = await readdir(DEFAULTS_DIR)
  const skills: CatalogSkill[] = []

  for (const entry of entries) {
    const entryPath = join(DEFAULTS_DIR, entry)
    const info = await stat(entryPath)
    if (!info.isDirectory()) continue

    const skillPath = join(entryPath, 'SKILL.md')
    try {
      const content = await readFile(skillPath, 'utf-8')
      const version = extractVersion(content)
      skills.push({ id: entry, version, content })
    } catch {
      console.error(`Skipping ${entry}: no SKILL.md found`)
    }
  }

  skills.sort((a, b) => a.id.localeCompare(b.id))

  return JSON.stringify({ version: 1, skills }, null, 2)
}

const catalog = await generateCatalog()

const outputIdx = process.argv.indexOf('-o')
if (outputIdx !== -1 && process.argv[outputIdx + 1]) {
  const outPath = process.argv[outputIdx + 1]
  await writeFile(outPath, catalog)
  console.log(
    `Wrote catalog with ${JSON.parse(catalog).skills.length} skills to ${outPath}`,
  )
} else {
  console.log(catalog)
}
