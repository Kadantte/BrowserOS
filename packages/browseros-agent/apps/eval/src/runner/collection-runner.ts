import { execSync } from 'node:child_process'
import { Browser } from '@browseros/server/browser'
import { CdpBackend } from '@browseros/server/browser/backends/cdp'
import { RecordWriter } from '../collectors/record-writer'
import { loadCollectionTargets } from '../collectors/target-loader'
import { validateOutput } from '../collectors/validator'
import { VlCollector } from '../collectors/vl-collector'
import type { CollectionTarget } from '../types/collection-target'
import type { EvalPorts } from '../utils/dev-config'
import { BrowserOSAppManager } from './browseros-app-manager'

const DEFAULT_BASE_PORTS: EvalPorts = {
  cdp: 9010,
  server: 9110,
  extension: 9310,
}

export interface CollectionRunnerOptions {
  seedsPath: string
  outDir: string
  projectRoot: string
  workers: number
  limit?: number
  headless: boolean
  basePorts?: EvalPorts
}

class TargetQueue {
  private index = 0
  private stopped = false
  constructor(private readonly targets: CollectionTarget[]) {}
  next(): CollectionTarget | null {
    if (this.stopped || this.index >= this.targets.length) return null
    return this.targets[this.index++]
  }
  stop(): void {
    this.stopped = true
  }
}

export async function runCollection(
  opts: CollectionRunnerOptions,
): Promise<{ writtenCount: number; errors: string[] }> {
  const loaded = await loadCollectionTargets(opts.seedsPath)
  const targets = opts.limit ? loaded.slice(0, opts.limit) : loaded

  const startedAt = new Date()
  const writer = new RecordWriter(opts.outDir, opts.projectRoot)
  await writer.init()

  const queue = new TargetQueue(targets)
  const appManagers: BrowserOSAppManager[] = []
  const workerCount = Math.max(1, Math.min(opts.workers, targets.length))

  const cleanupSignal = setupSignalHandlers(queue, appManagers)

  let writtenCount = 0
  try {
    const workers = Array.from({ length: workerCount }, (_, i) =>
      runWorker(i, queue, writer, opts, appManagers),
    )
    const counts = await Promise.all(workers)
    writtenCount = counts.reduce((a, b) => a + b, 0)
  } finally {
    await Promise.allSettled(appManagers.map((m) => m.killApp()))
    cleanupSignal()
  }

  await writer.writeManifest(startedAt, resolveCollectorTag())
  const errors = await validateOutput(opts.outDir, opts.projectRoot)
  return { writtenCount, errors }
}

async function runWorker(
  workerIndex: number,
  queue: TargetQueue,
  writer: RecordWriter,
  opts: CollectionRunnerOptions,
  appManagers: BrowserOSAppManager[],
): Promise<number> {
  const basePorts = opts.basePorts ?? DEFAULT_BASE_PORTS
  const appManager = new BrowserOSAppManager(
    workerIndex,
    basePorts,
    false,
    opts.headless,
  )
  await appManager.restart()
  appManagers.push(appManager)

  const { cdp: cdpPort } = appManager.getPorts()
  const cdp = new CdpBackend({ port: cdpPort })
  await cdp.connect()
  const browser = new Browser(cdp)

  const pages = await browser.listPages()
  const pageId = pages[0]?.pageId
  if (pageId === undefined) {
    throw new Error(`Worker ${workerIndex}: no initial page available`)
  }

  const collector = new VlCollector({
    browser,
    pageId,
    writer,
    log: (msg) => console.log(`worker ${workerIndex}:${msg}`),
  })

  let written = 0
  try {
    while (true) {
      const target = queue.next()
      if (!target) break
      console.log(
        `worker ${workerIndex}: collecting ${target.site} (${target.url})`,
      )
      written += await collector.collect(target)
    }
  } finally {
    await cdp.disconnect().catch(() => {})
  }
  return written
}

function setupSignalHandlers(
  queue: TargetQueue,
  appManagers: BrowserOSAppManager[],
): () => void {
  let tripped = false
  const onSignal = () => {
    if (tripped) return
    tripped = true
    console.log('\nShutting down: draining in-flight targets...')
    queue.stop()
    // Kick the app managers so workers unblock quickly. The outer `finally`
    // in runCollection will also await killApp — allSettled tolerates the
    // double-kill cleanly.
    for (const m of appManagers) {
      m.killApp().catch(() => {})
    }
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  return () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

function resolveCollectorTag(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    return sha ? `browseros-agent@${sha}` : 'browseros-agent@unknown'
  } catch {
    return 'browseros-agent@unknown'
  }
}
