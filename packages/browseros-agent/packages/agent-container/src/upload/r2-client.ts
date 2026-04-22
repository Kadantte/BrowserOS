import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`missing required env var: ${name}`)
  }

  return value
}

export function createR2Client(): S3Client {
  const config: S3ClientConfig = {
    region: 'auto',
    endpoint: `https://${requiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  }

  return new S3Client(config)
}

export function getBucket(): string {
  return requiredEnv('R2_BUCKET')
}

export async function uploadFile(
  client: S3Client,
  bucket: string,
  key: string,
  path: string,
  contentType = 'application/gzip',
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(path),
      ContentType: contentType,
    }),
  )
}

export async function uploadBody(
  client: S3Client,
  bucket: string,
  key: string,
  body: string | Uint8Array,
  contentType = JSON_CONTENT_TYPE,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function deleteObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}
