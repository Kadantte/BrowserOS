import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { S3Client } from '@aws-sdk/client-s3'
import { buildAgentTarballManifest, toPublishedAgentTarballs } from './manifest'
import { latestManifestObjectKey, releaseManifestObjectKey } from './naming'
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

function createUploadFile(
  client: S3Client,
  config: R2PublishConfig,
): (request: UploadFileRequest) => Promise<void> {
  return async (request) => {
    await uploadFileToObject(client, config, request)
  }
}

function manifestJson(manifest: AgentTarballManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

function groupArtifactsByRelease(
  artifacts: PublishedAgentTarball[],
): Map<string, PublishedAgentTarball[]> {
  const groups = new Map<string, PublishedAgentTarball[]>()

  for (const artifact of artifacts) {
    const key = `${artifact.agentId}:${artifact.version}`
    const group = groups.get(key)
    if (group) {
      group.push(artifact)
      continue
    }
    groups.set(key, [artifact])
  }

  return groups
}

async function uploadReleaseManifests(
  artifacts: PublishedAgentTarball[],
  config: R2PublishConfig,
  uploadFile: (request: UploadFileRequest) => Promise<void>,
  publishedAt?: string,
): Promise<void> {
  for (const releaseArtifacts of groupArtifactsByRelease(artifacts).values()) {
    const [artifact] = releaseArtifacts
    const manifest = buildAgentTarballManifest(releaseArtifacts, publishedAt)
    const manifestPath = join(
      dirname(dirname(artifact.tarGzPath)),
      'manifest.json',
    )
    await writeFile(manifestPath, manifestJson(manifest))
    await uploadFile({
      key: releaseManifestObjectKey(
        config.uploadPrefix,
        artifact.agentId,
        artifact.version,
      ),
      filePath: manifestPath,
      contentType: JSON_CONTENT_TYPE,
    })
  }
}

export async function publishAgentTarballs(
  artifacts: BuiltAgentTarball[],
  config: R2PublishConfig,
  options: PublishAgentTarballsOptions = {},
): Promise<PublishAgentTarballsResult> {
  const client = options.uploadFile ? undefined : createR2Client(config)
  const uploadFile =
    options.uploadFile ??
    (client ? createUploadFile(client, config) : undefined)
  if (!uploadFile) {
    throw new Error('Upload handler is not configured')
  }
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

    await uploadReleaseManifests(
      publishedArtifacts,
      config,
      uploadFile,
      options.publishedAt,
    )
    await writeFile(manifestPath, manifestJson(manifest))
    await uploadFile({
      key: latestManifestObjectKey(config.uploadPrefix),
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
