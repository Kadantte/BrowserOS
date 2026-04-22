import type { AgentEntry } from '../catalog/load'
import type { ContainerArch } from '../schema/arch'

export interface BuildOptions {
  agent: AgentEntry
  arch: ContainerArch
  outputDir: string
  recipePath?: string
  builtBy?: string
}

export interface BuildResult {
  name: string
  publishAs: string
  image: string
  version: string
  arch: ContainerArch
  sourceOciDigest: string
  imageId: string
  smokeFingerprint: string
  filename: string
  tarballPath: string
  tarballShaPath: string
  compressedSha256: string
  compressedSizeBytes: number
  uncompressedSha256: string
  uncompressedSizeBytes: number
  podmanVersion: string
  builtAt: string
  builtBy: string
  gitSha: string
  gitDirty: boolean
  configSha256: string
}
