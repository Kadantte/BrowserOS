import { describe, expect, it } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAgentTarballConfig } from './config'
import { getDefaultConfigPath } from './paths'

describe('loadAgentTarballConfig', () => {
  it('loads the bundled OpenClaw config', async () => {
    const config = await loadAgentTarballConfig(getDefaultConfigPath())

    expect(config.agents).toEqual([
      {
        agentId: 'openclaw',
        image: 'ghcr.io/openclaw/openclaw',
        version: '2026.4.12',
        platforms: ['linux/amd64', 'linux/arm64'],
      },
    ])
  })

  it('rejects duplicate agent/version/platform tuples', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-container-config-'))
    const path = join(dir, 'config.json')
    await writeFile(
      path,
      JSON.stringify({
        agents: [
          {
            agentId: 'openclaw',
            image: 'ghcr.io/openclaw/openclaw',
            version: '2026.4.12',
            platforms: ['linux/amd64', 'linux/amd64'],
          },
        ],
      }),
    )

    await expect(loadAgentTarballConfig(path)).rejects.toThrow(
      'Duplicate agent tarball entry: openclaw:2026.4.12:linux/amd64',
    )
  })
})
