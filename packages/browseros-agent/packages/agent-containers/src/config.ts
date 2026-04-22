import { readFile } from 'node:fs/promises'
import type {
  AgentTarballConfig,
  AgentTarballConfigEntry,
  AgentTarballPlatform,
} from './types'

const VALID_PLATFORMS: AgentTarballPlatform[] = ['linux/amd64', 'linux/arm64']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parsePlatforms(value: unknown): AgentTarballPlatform[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Agent entry must include at least one platform')
  }

  return value.map((entry) => {
    if (
      typeof entry !== 'string' ||
      !VALID_PLATFORMS.includes(entry as AgentTarballPlatform)
    ) {
      throw new Error(`Unsupported platform: ${String(entry)}`)
    }
    return entry as AgentTarballPlatform
  })
}

function parseEntry(value: unknown): AgentTarballConfigEntry {
  if (!isRecord(value)) {
    throw new Error('Agent entry must be an object')
  }

  const { agentId, image, version, platforms } = value
  if (typeof agentId !== 'string' || agentId.trim().length === 0) {
    throw new Error('Agent entry is missing agentId')
  }
  if (typeof image !== 'string' || image.trim().length === 0) {
    throw new Error(`Agent ${agentId} is missing image`)
  }
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new Error(`Agent ${agentId} is missing version`)
  }

  return {
    agentId,
    image,
    version,
    platforms: parsePlatforms(platforms),
  }
}

function assertUniqueEntries(config: AgentTarballConfig): void {
  const seen = new Set<string>()

  for (const agent of config.agents) {
    for (const platform of agent.platforms) {
      const key = `${agent.agentId}:${agent.version}:${platform}`
      if (seen.has(key)) {
        throw new Error(`Duplicate agent tarball entry: ${key}`)
      }
      seen.add(key)
    }
  }
}

export async function loadAgentTarballConfig(
  configPath: string,
): Promise<AgentTarballConfig> {
  const raw = JSON.parse(await readFile(configPath, 'utf-8')) as unknown
  if (!isRecord(raw) || !Array.isArray(raw.agents)) {
    throw new Error('Agent tarball config must contain an agents array')
  }

  const config = {
    agents: raw.agents.map((entry) => parseEntry(entry)),
  }
  assertUniqueEntries(config)
  return config
}

export function filterAgents(
  config: AgentTarballConfig,
  agentId?: string,
): AgentTarballConfigEntry[] {
  if (!agentId) return config.agents
  return config.agents.filter((agent) => agent.agentId === agentId)
}
