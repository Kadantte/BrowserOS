import type { UIMessageStreamEvent } from '@browseros/shared/schemas/ui-stream'
import type { BrowserOsStoredAgent } from '@browseros/shared/types/browseros-agents'
import { getOpenClawService } from '../openclaw/openclaw-service'
import { ClaudeLocalAgentAdapter } from './adapters/claude-local-adapter'
import { CodexLocalAgentAdapter } from './adapters/codex-local-adapter'
import { OpenClawAgentAdapter } from './adapters/openclaw-adapter'
import type {
  BrowserOsAgentAdapter,
  BrowserOsAgentCatalogEntry,
  BrowserOsAgentChatInput,
  BrowserOsAgentCreateInput,
} from './adapters/types'
import { AgentRegistryService } from './agent-registry-service'

interface BrowserOsAgentServiceOptions {
  registry?: AgentRegistryService
  adapters?: BrowserOsAgentAdapter[]
  openClawService?: ReturnType<typeof getOpenClawService>
}

export class BrowserOsAgentService {
  private readonly registry: AgentRegistryService
  private readonly adapters: Map<string, BrowserOsAgentAdapter>
  private readonly openClawService: ReturnType<typeof getOpenClawService>

  constructor(options: BrowserOsAgentServiceOptions = {}) {
    this.registry = options.registry ?? new AgentRegistryService()
    this.openClawService = options.openClawService ?? getOpenClawService()
    this.adapters = new Map(
      (options.adapters ?? this.createDefaultAdapters()).map((adapter) => [
        adapter.adapterType,
        adapter,
      ]),
    )
  }

  catalog(): BrowserOsAgentCatalogEntry[] {
    return Array.from(this.adapters.values()).map((adapter) => ({
      adapterType: adapter.adapterType,
      label: toAdapterLabel(adapter.adapterType),
    }))
  }

  async list(): Promise<BrowserOsStoredAgent[]> {
    return this.registry.list()
  }

  async get(agentId: string): Promise<BrowserOsStoredAgent | null> {
    return this.registry.get(agentId)
  }

  async create(
    input: BrowserOsAgentCreateInput,
  ): Promise<BrowserOsStoredAgent> {
    const adapter = this.getAdapter(input.adapterType)
    const existing = await this.registry.get(input.id)
    if (existing) {
      throw new Error(`Agent "${input.id}" already exists`)
    }
    await adapter.validateCreate(input)
    const created = await this.registry.create({
      id: input.id,
      name: input.name,
      adapterType: input.adapterType,
      adapterConfig: buildInitialAdapterConfig(input),
      runtimeBinding: null,
    })
    try {
      const materialized = await adapter.materialize(input)
      return await this.registry.update({
        ...created,
        adapterConfig: buildStoredAdapterConfig(input, materialized),
        runtimeBinding: materialized.runtimeBinding,
      })
    } catch (error) {
      try {
        await adapter.remove(created)
      } catch {}
      await this.registry.remove(input.id)
      throw error
    }
  }

  async remove(agentId: string): Promise<void> {
    const record = await this.registry.get(agentId)
    if (!record) {
      throw new Error(`Agent "${agentId}" not found`)
    }
    const adapter = this.getAdapter(record.adapterType)
    await adapter.remove(record)
    await this.registry.remove(agentId)
  }

  async chat(
    agentId: string,
    input: BrowserOsAgentChatInput,
  ): Promise<ReadableStream<UIMessageStreamEvent>> {
    const record = await this.registry.get(agentId)
    if (!record) {
      throw new Error(`Agent "${agentId}" not found`)
    }
    const adapter = this.getAdapter(record.adapterType)
    return adapter.streamChat(record, input)
  }

  private getAdapter(adapterType: string): BrowserOsAgentAdapter {
    const adapter = this.adapters.get(adapterType)
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${adapterType}`)
    }
    return adapter
  }

  private createDefaultAdapters(): BrowserOsAgentAdapter[] {
    return [
      new OpenClawAgentAdapter(this.openClawService),
      new CodexLocalAgentAdapter(),
      new ClaudeLocalAgentAdapter(),
    ]
  }
}

let browserOsAgentService: BrowserOsAgentService | null = null

export function getBrowserOsAgentService(): BrowserOsAgentService {
  if (!browserOsAgentService) {
    browserOsAgentService = new BrowserOsAgentService({
      openClawService: getOpenClawService(),
    })
  }
  return browserOsAgentService
}

function toAdapterLabel(adapterType: string): string {
  switch (adapterType) {
    case 'openclaw':
      return 'OpenClaw'
    case 'codex_local':
      return 'Codex Local'
    case 'claude_local':
      return 'Claude Local'
    default:
      return adapterType
  }
}

function buildInitialAdapterConfig(
  input: BrowserOsAgentCreateInput,
): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (
    (input.adapterType === 'codex_local' ||
      input.adapterType === 'claude_local') &&
    input.binaryPath?.trim()
  ) {
    config.binaryPath = input.binaryPath.trim()
  }
  if (
    input.adapterType === 'codex_local' &&
    input.dangerouslyBypassApprovalsAndSandbox === true
  ) {
    config.dangerouslyBypassApprovalsAndSandbox = true
  }
  if (
    input.adapterType === 'claude_local' &&
    input.dangerouslySkipPermissions === true
  ) {
    config.dangerouslySkipPermissions = true
  }
  return config
}

function buildStoredAdapterConfig(
  input: BrowserOsAgentCreateInput,
  materialized: { adapterConfig?: Record<string, unknown> },
): Record<string, unknown> {
  return {
    ...buildInitialAdapterConfig(input),
    ...(materialized.adapterConfig ?? {}),
  }
}
