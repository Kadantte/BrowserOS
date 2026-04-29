import { join } from 'node:path'
import type { PublishCliArgs, PublishTarget } from '../args'

export interface PublishRunOptions {
  runDir: string
  target: PublishTarget
}

/** Publishes run artifacts through the current upload script until the R2 module owns this path. */
export async function publishRun(options: PublishRunOptions): Promise<void> {
  if (options.target !== 'r2') {
    throw new Error(`Unsupported publish target: ${options.target}`)
  }
  const scriptPath = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'scripts',
    'upload-run.ts',
  )
  const proc = Bun.spawn(['bun', scriptPath, options.runDir], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`R2 upload failed with exit code ${exitCode}`)
  }
}

export async function runPublishCommand(args: PublishCliArgs): Promise<void> {
  await publishRun({ runDir: args.runDir, target: args.target })
}
