export type AgentTarballPlatform = 'linux/amd64' | 'linux/arm64'

export interface AgentTarballConfigEntry {
  agentId: string
  image: string
  version: string
  platforms: AgentTarballPlatform[]
}

export interface AgentTarballConfig {
  agents: AgentTarballConfigEntry[]
}

export interface BuiltAgentTarball {
  agentId: string
  version: string
  platform: AgentTarballPlatform
  imageRef: string
  tarGzPath: string
  filename: string
  sha256: string
}

export interface PublishedAgentTarball extends BuiltAgentTarball {
  objectKey: string
  url: string
}

export interface AgentTarballManifestAsset {
  agentId: string
  version: string
  platform: AgentTarballPlatform
  imageRef: string
  filename: string
  sha256: string
  objectKey: string
  url: string
}

export interface AgentTarballManifest {
  publishedAt: string
  assets: AgentTarballManifestAsset[]
}

export interface R2PublishConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  uploadPrefix: string
  cdnBaseUrl: string
}

export interface UploadFileRequest {
  contentType?: string
  filePath: string
  key: string
}
