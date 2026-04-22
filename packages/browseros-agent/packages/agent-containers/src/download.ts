import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { verifyFileSha256 } from './checksum'
import type { AgentTarballManifest, AgentTarballManifestAsset } from './types'

export async function downloadManifest(
  url: string,
): Promise<AgentTarballManifest> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download manifest: ${response.status}`)
  }
  return (await response.json()) as AgentTarballManifest
}

export async function downloadArtifact(
  asset: AgentTarballManifestAsset,
  destinationPath: string,
): Promise<void> {
  const response = await fetch(asset.url)
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${response.status}`)
  }

  if (!response.body) {
    throw new Error(
      `Failed to download artifact: empty response for ${asset.filename}`,
    )
  }

  await mkdir(dirname(destinationPath), { recursive: true })
  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream),
    createWriteStream(destinationPath),
  )

  if (!(await verifyFileSha256(destinationPath, asset.sha256))) {
    throw new Error(`Checksum verification failed for ${asset.filename}`)
  }
}
