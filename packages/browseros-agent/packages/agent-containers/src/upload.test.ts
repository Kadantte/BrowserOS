import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { BuiltAgentTarball, UploadFileRequest } from './types'
import { publishAgentTarballs } from './upload'

describe('publishAgentTarballs', () => {
  it('uploads tarballs and the generated manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-container-upload-'))
    const tarballPath = join(
      dir,
      'openclaw',
      '2026.4.12',
      'linux-amd64',
      'openclaw.tar.gz',
    )
    await mkdir(dirname(tarballPath), { recursive: true })
    await writeFile(tarballPath, 'archive')

    const uploads: UploadFileRequest[] = []
    const artifact: BuiltAgentTarball = {
      agentId: 'openclaw',
      version: '2026.4.12',
      platform: 'linux/amd64',
      imageRef: 'ghcr.io/openclaw/openclaw:2026.4.12',
      tarGzPath: tarballPath,
      filename: 'openclaw-2026.4.12-linux-amd64.tar.gz',
      sha256: 'a'.repeat(64),
    }

    const result = await publishAgentTarballs(
      [artifact],
      {
        accountId: 'account',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'bucket',
        uploadPrefix: 'agent-containers',
        cdnBaseUrl: 'https://cdn.browseros.com',
      },
      {
        manifestPath: join(dir, 'manifest.json'),
        uploadFile: async (request) => {
          uploads.push(request)
        },
        publishedAt: '2026-04-22T00:00:00.000Z',
      },
    )

    expect(result.publishedArtifacts).toHaveLength(1)
    expect(uploads).toEqual([
      {
        key: 'agent-containers/openclaw/2026.4.12/linux-amd64/openclaw-2026.4.12-linux-amd64.tar.gz',
        filePath: tarballPath,
        contentType: 'application/gzip',
      },
      {
        key: 'agent-containers/openclaw/2026.4.12/manifest.json',
        filePath: join(dir, 'openclaw', '2026.4.12', 'manifest.json'),
        contentType: 'application/json; charset=utf-8',
      },
      {
        key: 'agent-containers/latest/manifest.json',
        filePath: join(dir, 'manifest.json'),
        contentType: 'application/json; charset=utf-8',
      },
    ])
  })
})
