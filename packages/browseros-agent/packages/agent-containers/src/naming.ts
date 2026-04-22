import type { AgentTarballPlatform, BuiltAgentTarball } from './types'

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

export function joinObjectKey(...parts: string[]): string {
  return parts
    .map((part) => trimSlashes(part))
    .filter(Boolean)
    .join('/')
}

export function platformId(platform: AgentTarballPlatform): string {
  return platform.replace('/', '-')
}

export function imageRef(image: string, version: string): string {
  return `${image}:${version}`
}

export function archiveFilename(
  agentId: string,
  version: string,
  platform: AgentTarballPlatform,
): string {
  return `${agentId}-${version}-${platformId(platform)}.tar.gz`
}

export function archiveObjectKey(
  uploadPrefix: string,
  artifact: BuiltAgentTarball,
): string {
  return joinObjectKey(
    uploadPrefix,
    artifact.agentId,
    artifact.version,
    platformId(artifact.platform),
    artifact.filename,
  )
}

export function manifestObjectKey(uploadPrefix: string): string {
  return joinObjectKey(uploadPrefix, 'latest', 'manifest.json')
}
