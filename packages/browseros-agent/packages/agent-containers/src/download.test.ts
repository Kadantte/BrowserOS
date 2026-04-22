import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadArtifact } from './download'
import type { AgentTarballManifestAsset } from './types'

const ORIGINAL_FETCH = globalThis.fetch

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe('downloadArtifact', () => {
  it('streams the artifact to disk and verifies the checksum', async () => {
    const payload = 'archive'
    const asset: AgentTarballManifestAsset = {
      agentId: 'openclaw',
      version: '2026.4.12',
      platform: 'linux/amd64',
      imageRef: 'ghcr.io/openclaw/openclaw:2026.4.12',
      filename: 'openclaw-2026.4.12-linux-amd64.tar.gz',
      sha256: sha256(payload),
      objectKey:
        'agent-containers/openclaw/2026.4.12/linux-amd64/openclaw-2026.4.12-linux-amd64.tar.gz',
      url: 'https://cdn.browseros.com/agent-containers/openclaw/2026.4.12/linux-amd64/openclaw-2026.4.12-linux-amd64.tar.gz',
    }
    const destinationPath = join(
      tmpdir(),
      `agent-container-download-${Date.now()}.tar.gz`,
    )

    globalThis.fetch = (async () =>
      new Response(payload)) as unknown as typeof fetch

    await downloadArtifact(asset, destinationPath)

    expect(await readFile(destinationPath, 'utf-8')).toBe(payload)
  })
})
