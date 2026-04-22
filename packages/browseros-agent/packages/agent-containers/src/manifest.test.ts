import { describe, expect, it } from 'bun:test'
import { buildAgentTarballManifest, toPublishedAgentTarballs } from './manifest'
import type { BuiltAgentTarball } from './types'

const ARTIFACT: BuiltAgentTarball = {
  agentId: 'openclaw',
  version: '2026.4.12',
  platform: 'linux/amd64',
  imageRef: 'ghcr.io/openclaw/openclaw:2026.4.12',
  tarGzPath: '/tmp/openclaw.tar.gz',
  filename: 'openclaw-2026.4.12-linux-amd64.tar.gz',
  sha256: 'a'.repeat(64),
}

describe('buildAgentTarballManifest', () => {
  it('emits manifest assets with object keys and URLs', () => {
    const published = toPublishedAgentTarballs(
      [ARTIFACT],
      'agent-containers',
      'https://cdn.browseros.com',
    )
    const manifest = buildAgentTarballManifest(
      published,
      '2026-04-22T00:00:00.000Z',
    )

    expect(manifest).toEqual({
      publishedAt: '2026-04-22T00:00:00.000Z',
      assets: [
        {
          agentId: 'openclaw',
          version: '2026.4.12',
          platform: 'linux/amd64',
          imageRef: 'ghcr.io/openclaw/openclaw:2026.4.12',
          filename: 'openclaw-2026.4.12-linux-amd64.tar.gz',
          sha256: 'a'.repeat(64),
          objectKey:
            'agent-containers/openclaw/2026.4.12/linux-amd64/openclaw-2026.4.12-linux-amd64.tar.gz',
          url: 'https://cdn.browseros.com/agent-containers/openclaw/2026.4.12/linux-amd64/openclaw-2026.4.12-linux-amd64.tar.gz',
        },
      ],
    })
  })
})
