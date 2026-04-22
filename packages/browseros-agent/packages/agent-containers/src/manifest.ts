import { archiveObjectKey } from './naming'
import type {
  AgentTarballManifest,
  BuiltAgentTarball,
  PublishedAgentTarball,
} from './types'

function assetUrl(cdnBaseUrl: string, objectKey: string): string {
  return `${cdnBaseUrl.replace(/\/+$/g, '')}/${objectKey}`
}

export function toPublishedAgentTarballs(
  artifacts: BuiltAgentTarball[],
  uploadPrefix: string,
  cdnBaseUrl: string,
): PublishedAgentTarball[] {
  return artifacts.map((artifact) => {
    const objectKey = archiveObjectKey(uploadPrefix, artifact)
    return {
      ...artifact,
      objectKey,
      url: assetUrl(cdnBaseUrl, objectKey),
    }
  })
}

export function buildAgentTarballManifest(
  artifacts: PublishedAgentTarball[],
  publishedAt = new Date().toISOString(),
): AgentTarballManifest {
  return {
    publishedAt,
    assets: artifacts.map((artifact) => ({
      agentId: artifact.agentId,
      version: artifact.version,
      platform: artifact.platform,
      imageRef: artifact.imageRef,
      filename: artifact.filename,
      sha256: artifact.sha256,
      objectKey: artifact.objectKey,
      url: artifact.url,
    })),
  }
}
