import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAgentTarball } from './build'
import type { AgentTarballConfigEntry } from './types'

const OPENCLAW_ENTRY: AgentTarballConfigEntry = {
  agentId: 'openclaw',
  image: 'ghcr.io/openclaw/openclaw',
  version: '2026.4.12',
  platforms: ['linux/amd64', 'linux/arm64'],
}

describe('buildAgentTarball', () => {
  it('runs podman pull and save, then emits a gzipped archive', async () => {
    const calls: string[][] = []
    const outputDir = await mkdtemp(join(tmpdir(), 'agent-container-build-'))

    const artifact = await buildAgentTarball(
      OPENCLAW_ENTRY,
      'linux/amd64',
      outputDir,
      {
        commandRunner: async (command) => {
          calls.push(command)
          const outputIndex = command.indexOf('-o')
          if (outputIndex >= 0) {
            await writeFile(command[outputIndex + 1], 'oci archive')
          }
        },
      },
    )

    expect(calls).toEqual([
      [
        'podman',
        'pull',
        '--platform',
        'linux/amd64',
        'ghcr.io/openclaw/openclaw:2026.4.12',
      ],
      [
        'podman',
        'save',
        '--format=oci-archive',
        '-o',
        expect.stringContaining('openclaw-2026.4.12-linux-amd64.tar'),
        'ghcr.io/openclaw/openclaw:2026.4.12',
      ],
    ])
    expect(artifact.filename).toBe('openclaw-2026.4.12-linux-amd64.tar.gz')
    expect(existsSync(artifact.tarGzPath)).toBe(true)
    expect(artifact.sha256).toHaveLength(64)
  })
})
