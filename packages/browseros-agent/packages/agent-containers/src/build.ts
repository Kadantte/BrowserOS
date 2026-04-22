import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { sha256File } from './checksum'
import { archiveFilename, imageRef, platformId } from './naming'
import { type CommandRunner, runCommand } from './process'
import type {
  AgentTarballConfigEntry,
  AgentTarballPlatform,
  BuiltAgentTarball,
} from './types'

export interface BuildAgentTarballOptions {
  commandRunner?: CommandRunner
}

function outputDirFor(
  baseOutputDir: string,
  entry: AgentTarballConfigEntry,
  platform: AgentTarballPlatform,
): string {
  return join(baseOutputDir, entry.agentId, entry.version, platformId(platform))
}

async function gzipFile(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await pipeline(
    createReadStream(sourcePath),
    createGzip(),
    createWriteStream(destinationPath),
  )
}

export async function buildAgentTarball(
  entry: AgentTarballConfigEntry,
  platform: AgentTarballPlatform,
  baseOutputDir: string,
  options: BuildAgentTarballOptions = {},
): Promise<BuiltAgentTarball> {
  const runner = options.commandRunner ?? runCommand
  const artifactDir = outputDirFor(baseOutputDir, entry, platform)
  const filename = archiveFilename(entry.agentId, entry.version, platform)
  const tarPath = join(artifactDir, filename.replace(/\.gz$/, ''))
  const tarGzPath = join(artifactDir, filename)
  const ref = imageRef(entry.image, entry.version)

  await mkdir(artifactDir, { recursive: true })
  await runner(['podman', 'pull', '--platform', platform, ref])
  await runner(['podman', 'save', '--format=oci-archive', '-o', tarPath, ref])
  await gzipFile(tarPath, tarGzPath)
  await rm(tarPath, { force: true })

  return {
    agentId: entry.agentId,
    version: entry.version,
    platform,
    imageRef: ref,
    tarGzPath,
    filename,
    sha256: await sha256File(tarGzPath),
  }
}
