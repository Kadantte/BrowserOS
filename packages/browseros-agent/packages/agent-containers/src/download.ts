import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
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

  await mkdir(dirname(destinationPath), { recursive: true })
  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()))

  if (!(await verifyFileSha256(destinationPath, asset.sha256))) {
    throw new Error(`Checksum verification failed for ${asset.filename}`)
  }
}
