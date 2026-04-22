import { createHash } from 'node:crypto'

import type { ContainerArch } from '../schema/arch'

const PODMAN_BIN = process.env.PODMAN_BIN ?? 'podman'

interface PodmanCommandResult {
  stdout: string
  stderr: string
}

interface PodmanInspectShape {
  Id?: string
  Digest?: string
  RepoDigests?: string[]
  Architecture?: string
  Os?: string
  Config?: unknown
  RootFS?: unknown
}

export interface PodmanImageMetadata {
  imageId: string
  sourceOciDigest: string
  smokeFingerprint: string
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    )
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function smokeFingerprintForInspect(inspected: PodmanInspectShape): string {
  const payload = stableJson({
    Architecture: inspected.Architecture ?? '',
    Os: inspected.Os ?? '',
    Config: inspected.Config ?? null,
    RootFS: inspected.RootFS ?? null,
  })
  return createHash('sha256').update(payload).digest('hex')
}

function normalizeSha256Like(value: string): string {
  const trimmed = value.trim()
  if (/^sha256:[a-f0-9]{64}$/.test(trimmed)) {
    return trimmed
  }
  if (/^[a-f0-9]{64}$/.test(trimmed)) {
    return `sha256:${trimmed}`
  }

  throw new Error(`unexpected sha256-like value: ${value}`)
}

async function runPodman(
  args: string[],
  options: { stdin?: string } = {},
): Promise<PodmanCommandResult> {
  const proc = Bun.spawn([PODMAN_BIN, ...args], {
    stdin: options.stdin ? Buffer.from(`${options.stdin}\n`) : undefined,
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
      `podman ${args.join(' ')} exited ${exitCode}\n${stderr.trim() || stdout.trim()}`,
    )
  }

  return { stdout, stderr }
}

export function registryForImage(image: string): string {
  const firstSegment = image.split('/')[0]
  if (
    !firstSegment ||
    (!firstSegment.includes('.') &&
      !firstSegment.includes(':') &&
      firstSegment !== 'localhost')
  ) {
    return 'docker.io'
  }

  return firstSegment
}

export async function podmanVersion(): Promise<string> {
  const { stdout } = await runPodman(['--version'])
  return stdout.trim()
}

export async function podmanLogin(options: {
  registry: string
  username: string
  password: string
}): Promise<void> {
  await runPodman(
    [
      'login',
      '--username',
      options.username,
      '--password-stdin',
      options.registry,
    ],
    { stdin: options.password },
  )
}

export async function podmanPull(
  imageRef: string,
  arch: ContainerArch,
): Promise<void> {
  await runPodman([
    'pull',
    '--quiet',
    '--os',
    'linux',
    '--arch',
    arch,
    imageRef,
  ])
}

export async function podmanInspectImage(
  imageRef: string,
): Promise<PodmanImageMetadata> {
  const { stdout } = await runPodman([
    'inspect',
    '--format',
    '{{json .}}',
    imageRef,
  ])
  const inspected = JSON.parse(stdout.trim()) as PodmanInspectShape
  const imageId = normalizeSha256Like(inspected.Id ?? '')
  const platformDigest = normalizeSha256Like(inspected.Digest ?? imageId)
  const repoDigests = [
    ...new Set(
      (inspected.RepoDigests ?? [])
        .map((entry) => entry.split('@')[1] ?? '')
        .filter(Boolean)
        .map((entry) => normalizeSha256Like(entry)),
    ),
  ]
  const sourceOciDigest =
    repoDigests.find((digest) => digest !== platformDigest) ?? platformDigest

  return {
    imageId,
    sourceOciDigest,
    smokeFingerprint: smokeFingerprintForInspect(inspected),
  }
}

export async function podmanSaveOci(options: {
  imageRef: string
  outPath: string
}): Promise<void> {
  await runPodman([
    'save',
    '--format',
    'oci-archive',
    '--output',
    options.outPath,
    options.imageRef,
  ])
}

export async function podmanLoadArchive(tarballPath: string): Promise<void> {
  await runPodman(['load', '--input', tarballPath])
}

export async function podmanRemoveImage(imageRef: string): Promise<void> {
  await runPodman(['rmi', '-f', imageRef])
}
