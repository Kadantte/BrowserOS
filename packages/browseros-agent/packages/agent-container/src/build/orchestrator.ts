import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { publishNameForAgent } from '../catalog/load'
import { sha256OfFile } from '../upload/r2-client'
import {
  podmanInspectImage,
  podmanLogin,
  podmanPull,
  podmanSaveOci,
  podmanVersion,
  registryForImage,
} from './podman'
import type { BuildOptions, BuildResult } from './types'

function recipePathForPackage(): string {
  return resolve(import.meta.dir, '..', '..', 'recipe', 'agents.json')
}

function imageRefForBuild(options: BuildOptions): string {
  return `${options.agent.image}:${options.agent.version}`
}

function builtByForBuild(explicitBuiltBy?: string): string {
  if (explicitBuiltBy) {
    return explicitBuiltBy
  }

  const workflowRef = process.env.GITHUB_WORKFLOW_REF?.trim()
  if (workflowRef) {
    return workflowRef
  }

  const workflow = process.env.GITHUB_WORKFLOW?.trim()
  const ref = process.env.GITHUB_REF?.trim()
  if (workflow && ref) {
    return `${workflow}@${ref}`
  }

  const user = process.env.USER ?? process.env.LOGNAME ?? 'unknown'
  return `local:${user}`
}

async function runCommand(command: string[]): Promise<string> {
  const proc = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} exited ${exitCode}\n${stderr.trim() || stdout.trim()}`,
    )
  }

  return stdout.trim()
}

async function gzipArchive(tarPath: string): Promise<void> {
  const proc = Bun.spawn(['gzip', '-9', '-f', '-k', tarPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`gzip exited ${exitCode}\n${stderr.trim()}`)
  }
}

async function gitSha(): Promise<string> {
  return runCommand(['git', 'rev-parse', 'HEAD'])
}

async function gitDirty(): Promise<boolean> {
  const stdout = await runCommand(['git', 'status', '--short'])
  return stdout.length > 0
}

async function maybeLoginForAgent(options: BuildOptions): Promise<void> {
  const auth = options.agent.requires_auth
  if (!auth) {
    return
  }

  const password = process.env[auth.secret]?.trim()
  if (!password) {
    throw new Error(`missing registry credential env var: ${auth.secret}`)
  }

  await podmanLogin({
    registry: registryForImage(options.agent.image),
    username: auth.username ?? 'oauth2accesstoken',
    password,
  })
}

export async function buildTarball(
  options: BuildOptions,
): Promise<BuildResult> {
  const imageRef = imageRefForBuild(options)
  const publishAs = publishNameForAgent(options.agent)
  const outputDir = resolve(options.outputDir)
  const recipePath = resolve(options.recipePath ?? recipePathForPackage())
  const baseName = `${publishAs}-${options.agent.version}-${options.arch}.tar`
  const tarPath = join(outputDir, baseName)
  const tarballPath = `${tarPath}.gz`
  const tarballShaPath = `${tarballPath}.sha256`
  const buildResultPath = join(outputDir, 'build-result.json')

  await mkdir(outputDir, { recursive: true })
  await Promise.all([
    rm(tarPath, { force: true }),
    rm(tarballPath, { force: true }),
    rm(tarballShaPath, { force: true }),
    rm(buildResultPath, { force: true }),
  ])

  const [gitShaValue, gitDirtyValue, configSha256, podmanVersionValue] =
    await Promise.all([
      gitSha(),
      gitDirty(),
      sha256OfFile(recipePath),
      podmanVersion(),
    ])
  const builtAt = new Date().toISOString()
  const builtBy = builtByForBuild(options.builtBy)

  await maybeLoginForAgent(options)
  await podmanPull(imageRef, options.arch)
  const inspection = await podmanInspectImage(imageRef)
  await podmanSaveOci({ imageRef, outPath: tarPath })
  await gzipArchive(tarPath)

  const [
    compressedSha256,
    uncompressedSha256,
    compressedStats,
    uncompressedStats,
  ] = await Promise.all([
    sha256OfFile(tarballPath),
    sha256OfFile(tarPath),
    stat(tarballPath),
    stat(tarPath),
  ])

  const filename = basename(tarballPath)
  await writeFile(tarballShaPath, `${compressedSha256}  ${filename}\n`, 'utf8')
  await rm(tarPath, { force: true })

  const result: BuildResult = {
    name: options.agent.name,
    publishAs,
    image: options.agent.image,
    version: options.agent.version,
    arch: options.arch,
    sourceOciDigest: inspection.sourceOciDigest,
    imageId: inspection.imageId,
    smokeFingerprint: inspection.smokeFingerprint,
    filename,
    tarballPath,
    tarballShaPath,
    compressedSha256,
    compressedSizeBytes: compressedStats.size,
    uncompressedSha256,
    uncompressedSizeBytes: uncompressedStats.size,
    podmanVersion: podmanVersionValue,
    builtAt,
    builtBy,
    gitSha: gitShaValue,
    gitDirty: gitDirtyValue,
    configSha256,
  }

  await writeFile(
    buildResultPath,
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  )
  return result
}

export async function loadBuildResult(path: string): Promise<BuildResult> {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as BuildResult
}
