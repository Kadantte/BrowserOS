import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function verifyFileSha256(
  filePath: string,
  expectedSha256: string,
): Promise<boolean> {
  return (await sha256File(filePath)) === expectedSha256.toLowerCase()
}
