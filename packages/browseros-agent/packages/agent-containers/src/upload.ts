import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildAgentTarballManifest, toPublishedAgentTarballs } from './manifest'
import { manifestObjectKey } from './naming'
import { createR2Client, uploadFileToObject } from './r2'
import type {
  AgentTarballManifest,
  BuiltAgentTarball,
  PublishedAgentTarball,
  R2PublishConfig,
  UploadFileRequest,
} from './types'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

export interface PublishAgentTarballsOptions {
  manifestPath?: string
  publishedAt?: string
  uploadFile?: (request: UploadFileRequest) => Promise<void>
}

export interface PublishAgentTarballsResult {
  manifest: AgentTarballManifest
  manifestPath: string
  publishedArtifacts: PublishedAgentTarball[]
}

export async function publishAgentTarballs(
  artifacts: BuiltAgentTarball[],
  config: R2PublishConfig,
  options: PublishAgentTarballsOptions = {},
): Promise<PublishAgentTarballsResult> {
  const client = options.uploadFile ? null : createR2Client(config)
  const uploadFile =
    options.uploadFile ??
    (async (request: UploadFileRequest) => {
      await uploadFileToObject(client!, config, request)
    })
  const publishedArtifacts = toPublishedAgentTarballs(
    artifacts,
    config.uploadPrefix,
    config.cdnBaseUrl,
  )
  const manifest = buildAgentTarballManifest(
    publishedArtifacts,
    options.publishedAt,
  )
  const manifestPath =
    options.manifestPath ??
    join(process.cwd(), 'dist', 'agent-tarballs', 'manifest.json')

  try {
    for (const artifact of publishedArtifacts) {
      await uploadFile({
        key: artifact.objectKey,
        filePath: artifact.tarGzPath,
        contentType: 'application/gzip',
      })
    }

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await uploadFile({
      key: manifestObjectKey(config.uploadPrefix),
      filePath: manifestPath,
      contentType: JSON_CONTENT_TYPE,
    })
  } finally {
    client?.destroy()
  }

  return {
    manifest,
    manifestPath,
    publishedArtifacts,
  }
}
