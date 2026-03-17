/**
 * Full E2E server flow test — exercises the real startup + sync behavior
 * against the live CDN with a short sync interval.
 */

import { afterAll, beforeAll, describe, it, mock } from 'bun:test'
import assert from 'node:assert'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let testDir: string

const mockGetSkillsDir = mock(() => testDir)

mock.module('../../src/lib/browseros-dir', () => ({
  getSkillsDir: mockGetSkillsDir,
}))

mock.module('../../src/env', () => ({
  INLINED_ENV: {
    SKILLS_CATALOG_URL: 'https://cdn.browseros.com/skills/v1/catalog.json',
  },
}))

const { seedDefaultSkills } = await import('../../src/skills/seed')
const { syncRemoteSkills, loadManifest } =
  await import('../../src/skills/remote-sync')

async function listSkills(): Promise<string[]> {
  const entries = await readdir(testDir)
  return entries.filter((e) => !e.startsWith('.')).sort()
}

beforeAll(async () => {
  testDir = join(tmpdir(), `e2e-server-flow-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
})

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('Full server flow E2E against live CDN', () => {
  it('Step 1: fresh install seeds 12 skills from CDN', async () => {
    console.log(`\n  Skills dir: ${testDir}`)
    const before = await listSkills()
    assert.strictEqual(before.length, 0)

    await seedDefaultSkills()

    const after = await listSkills()
    console.log(`  Seeded: ${after.join(', ')}`)
    assert.strictEqual(after.length, 12)

    const manifest = await loadManifest()
    assert.strictEqual(Object.keys(manifest.skills).length, 12)
    assert.ok(manifest.lastSyncedAt)
    console.log(`  Manifest tracks ${Object.keys(manifest.skills).length} skills, last synced: ${manifest.lastSyncedAt}`)
  })

  it('Step 2: sync does nothing when already up to date', async () => {
    const result = await syncRemoteSkills()
    console.log(`  Sync: installed=${result.installed}, updated=${result.updated}, skipped=${result.skipped}`)
    assert.strictEqual(result.installed, 0)
    assert.strictEqual(result.updated, 0)
    assert.strictEqual(result.skipped, 0)
  })

  it('Step 3: user-edited skill is preserved during sync', async () => {
    const drPath = join(testDir, 'deep-research', 'SKILL.md')
    const original = await readFile(drPath, 'utf-8')
    await writeFile(drPath, original + '\n\n## My Custom Notes\nCheck arxiv first.\n')
    console.log('  Added custom notes to deep-research')

    // Fake version mismatch to trigger update check
    const manifestPath = join(testDir, '.remote-manifest.json')
    const m = JSON.parse(await readFile(manifestPath, 'utf-8'))
    m.skills['deep-research'].version = '0.1'
    await writeFile(manifestPath, JSON.stringify(m))

    const result = await syncRemoteSkills()
    console.log(`  Sync: installed=${result.installed}, updated=${result.updated}, skipped=${result.skipped}`)
    assert.ok(result.skipped >= 1)

    const afterSync = await readFile(drPath, 'utf-8')
    assert.ok(afterSync.includes('## My Custom Notes'))
    assert.ok(afterSync.includes('Check arxiv first.'))
    console.log('  User edits preserved: YES')
  })

  it('Step 4: deleted skill gets reinstalled on sync', async () => {
    await rm(join(testDir, 'save-page'), { recursive: true })
    const manifestPath = join(testDir, '.remote-manifest.json')
    const m = JSON.parse(await readFile(manifestPath, 'utf-8'))
    delete m.skills['save-page']
    await writeFile(manifestPath, JSON.stringify(m))
    console.log('  Deleted save-page locally')

    const result = await syncRemoteSkills()
    console.log(`  Sync: installed=${result.installed}, updated=${result.updated}, skipped=${result.skipped}`)
    assert.strictEqual(result.installed, 1)

    const skills = await listSkills()
    assert.ok(skills.includes('save-page'))
    console.log('  save-page reinstalled: YES')
  })

  it('Step 5: user-created custom skill is never touched', async () => {
    const customDir = join(testDir, 'my-workflow')
    await mkdir(customDir, { recursive: true })
    const customContent = '---\nname: my-workflow\ndescription: custom\n---\n# My Workflow\n'
    await writeFile(join(customDir, 'SKILL.md'), customContent)
    console.log('  Created my-workflow skill')

    const result = await syncRemoteSkills()
    console.log(`  Sync: installed=${result.installed}, updated=${result.updated}, skipped=${result.skipped}`)

    const afterSync = await readFile(join(customDir, 'SKILL.md'), 'utf-8')
    assert.strictEqual(afterSync, customContent)

    const manifest = await loadManifest()
    assert.strictEqual(manifest.skills['my-workflow'], undefined)
    console.log('  Custom skill untouched: YES, not in manifest: YES')
  })

  it('Step 6: background sync fires on interval (10s interval, wait 25s)', async () => {
    let syncCount = 0

    const timer = setInterval(async () => {
      try {
        const r = await syncRemoteSkills()
        syncCount++
        console.log(`  Background sync #${syncCount}: installed=${r.installed}, updated=${r.updated}, skipped=${r.skipped}`)
      } catch {
        // ignore
      }
    }, 10_000)
    timer.unref()

    console.log('  Timer started (10s). Waiting 25s...')
    await new Promise((resolve) => setTimeout(resolve, 25_000))
    clearInterval(timer)

    console.log(`  Background syncs fired: ${syncCount}`)
    assert.ok(syncCount >= 2, `Expected at least 2 syncs, got ${syncCount}`)
  }, 35_000)

  it('Step 7: second startup skips seeding (skills already exist)', async () => {
    const skillsBefore = await listSkills()
    await seedDefaultSkills()
    const skillsAfter = await listSkills()

    assert.deepStrictEqual(skillsBefore, skillsAfter)
    console.log('  Second startup: seeding skipped (skills already exist)')
  })
})
