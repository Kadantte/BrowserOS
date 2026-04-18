import { randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { VL_VIEWPORT_HEIGHT, VL_VIEWPORT_WIDTH } from '../constants'
import type { CollectedRecord } from '../types/collection-target'

export interface PreparedRecord
  extends Omit<CollectedRecord, 'id' | 'screenshot_path'> {}

export interface WriteResult {
  id: string
  screenshotPath: string
  jsonPath: string
}

export class RecordWriter {
  private readonly siteCounts = new Map<string, number>()

  constructor(
    private readonly outDir: string,
    private readonly projectRoot: string,
  ) {}

  async init(): Promise<void> {
    await mkdir(join(this.outDir, 'screenshots'), { recursive: true })
    await mkdir(join(this.outDir, 'raw'), { recursive: true })
  }

  async write(record: PreparedRecord, pngBase64: string): Promise<WriteResult> {
    const shortUuid = randomUUID().replace(/-/g, '').slice(0, 8)
    const id = `${record.site}_${shortUuid}`

    const pngPath = join(this.outDir, 'screenshots', `${id}.png`)
    const jsonPath = join(this.outDir, 'raw', `${id}.json`)

    // temp + rename so a crash between png and json writes doesn't leave
    // orphan files that future validators would flag.
    await writeAtomic(pngPath, Buffer.from(pngBase64, 'base64'))

    const finalRecord: CollectedRecord = {
      ...record,
      id,
      screenshot_path: relative(this.projectRoot, pngPath),
    }
    await writeAtomic(jsonPath, `${JSON.stringify(finalRecord, null, 2)}\n`)

    this.siteCounts.set(
      record.site,
      (this.siteCounts.get(record.site) ?? 0) + 1,
    )
    return { id, screenshotPath: pngPath, jsonPath }
  }

  async writeManifest(collectedAt: Date, collectorTag: string): Promise<void> {
    const sites = [...this.siteCounts.entries()].map(([site, states]) => ({
      site,
      states,
    }))
    const manifest = {
      collected_at: collectedAt.toISOString(),
      collector: collectorTag,
      total_records: [...this.siteCounts.values()].reduce((a, b) => a + b, 0),
      sites,
      viewport: { width: VL_VIEWPORT_WIDTH, height: VL_VIEWPORT_HEIGHT },
    }
    await writeAtomic(
      join(this.outDir, 'meta.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
  }

  getSiteCounts(): Map<string, number> {
    return new Map(this.siteCounts)
  }
}

async function writeAtomic(
  path: string,
  data: string | Buffer | Uint8Array,
): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}
