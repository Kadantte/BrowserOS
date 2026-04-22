import { readFile } from 'node:fs/promises'
import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { joinObjectKey } from './naming'
import type { R2PublishConfig, UploadFileRequest } from './types'

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function createClientConfig(config: R2PublishConfig): S3ClientConfig {
  return {
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }
}

export function loadR2PublishConfig(
  env: NodeJS.ProcessEnv = process.env,
): R2PublishConfig {
  return {
    accountId: requireEnv('R2_ACCOUNT_ID', env),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID', env),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY', env),
    bucket: requireEnv('R2_BUCKET', env),
    uploadPrefix:
      env.AGENT_CONTAINERS_R2_UPLOAD_PREFIX?.trim() || 'agent-containers',
    cdnBaseUrl:
      env.AGENT_CONTAINERS_CDN_BASE_URL?.trim() || 'https://cdn.browseros.com',
  }
}

export function createR2Client(config: R2PublishConfig): S3Client {
  return new S3Client(createClientConfig(config))
}

export async function uploadFileToObject(
  client: S3Client,
  config: R2PublishConfig,
  request: UploadFileRequest,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: joinObjectKey(request.key),
      Body: await readFile(request.filePath),
      ContentType: request.contentType ?? 'application/octet-stream',
    }),
  )
}
