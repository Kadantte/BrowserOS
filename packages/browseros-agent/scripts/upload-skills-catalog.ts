import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { generateCatalog } from './catalog-utils'

const R2_KEY = 'skills/v1/catalog.json'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

const accountId = requireEnv('R2_ACCOUNT_ID')
const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
const bucket = requireEnv('R2_BUCKET')

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

const catalog = await generateCatalog()
const body = JSON.stringify(catalog, null, 2)

console.log(`Generated catalog with ${catalog.skills.length} skills`)

await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: R2_KEY,
    Body: body,
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300',
  }),
)

console.log(`Uploaded to R2: ${bucket}/${R2_KEY}`)
