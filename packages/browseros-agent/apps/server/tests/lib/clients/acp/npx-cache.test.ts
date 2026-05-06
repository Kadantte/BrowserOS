import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { probeNpxCache } from '../../../../src/lib/clients/acp/npx-cache'

const ENV_KEY = 'BROWSEROS_NPX_CACHE_ROOT'
let tempRoot: string
let savedEnv: string | undefined

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'acp-npx-test-'))
  savedEnv = process.env[ENV_KEY]
  process.env[ENV_KEY] = tempRoot
})

afterEach(async () => {
  if (savedEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = savedEnv
  await rm(tempRoot, { recursive: true, force: true })
})

async function seed(hash: string, packageName: string): Promise<void> {
  const dir = path.join(tempRoot, hash, 'node_modules', packageName)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: packageName, version: '0.0.0' }),
  )
}

describe('probeNpxCache', () => {
  it('returns false on an empty cache', async () => {
    expect(await probeNpxCache('pi-acp')).toBe(false)
  })

  it('returns false when a missing root directory throws ENOENT', async () => {
    process.env[ENV_KEY] = path.join(tempRoot, 'nonexistent')
    expect(await probeNpxCache('pi-acp')).toBe(false)
  })

  it('finds an unscoped package in any hash dir', async () => {
    await seed('abc123', 'pi-acp')
    expect(await probeNpxCache('pi-acp')).toBe(true)
  })

  it('finds a scoped package', async () => {
    await seed('def456', '@kilocode/cli')
    expect(await probeNpxCache('@kilocode/cli')).toBe(true)
  })

  it('returns false when a different package is cached', async () => {
    await seed('abc123', 'some-other-pkg')
    expect(await probeNpxCache('pi-acp')).toBe(false)
  })

  it('returns false on empty input', async () => {
    expect(await probeNpxCache('')).toBe(false)
  })
})
