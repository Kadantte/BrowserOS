/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Main orchestrator for OpenClaw integration.
 * Container lifecycle via Podman, agent CRUD via Gateway WS RPC,
 * chat via HTTP /v1/chat/completions proxy.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { OPENCLAW_GATEWAY_PORT } from '@browseros/shared/constants/openclaw'
import { DEFAULT_PORTS } from '@browseros/shared/constants/ports'
import type {
  BrowserOSAgentRoleId,
  BrowserOSAgentRoleSummary,
  BrowserOSCustomRoleInput,
} from '@browseros/shared/types/role-aware-agents'
import { getOpenClawDir } from '../../../lib/browseros-dir'
import { logger } from '../../../lib/logger'
import { chatStreamHttp } from './chat-stream'
import { ContainerRuntime } from './container-runtime'
import {
  OpenClawAgentAlreadyExistsError,
  OpenClawAgentNotFoundError,
  OpenClawInvalidAgentNameError,
  OpenClawProtectedAgentError,
} from './errors'
import {
  connectWithRetry,
  type GatewayAgentEntry,
  GatewayClient,
  type OpenClawStreamEvent,
} from './gateway-client'
import {
  buildBootstrapConfig,
  buildEnvFile,
  deriveOpenClawApiKeyEnvVar,
  deriveOpenClawProviderId,
  PROVIDER_ENV_MAP,
  resolveProviderKeys,
  resolveProviderModel,
} from './openclaw-config'
import { getPodmanRuntime } from './podman-runtime'
import {
  buildRoleBootstrapFiles,
  resolveRoleTemplate,
  toRoleSummary,
} from './role-bootstrap'

const COMPOSE_RESOURCE = resolve(
  import.meta.dir,
  '../../../../resources/openclaw-compose.yml',
)
const OPENCLAW_CONFIG_FILE = 'openclaw.json'
const READY_TIMEOUT_MS = 30_000
const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/

export type OpenClawControlPlaneStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'recovering'
  | 'failed'

export type OpenClawStatus =
  | 'uninitialized'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'error'

export interface OpenClawStatusResponse {
  status: OpenClawStatus
  podmanAvailable: boolean
  machineReady: boolean
  port: number | null
  agentCount: number
  error: string | null
  controlPlaneStatus: OpenClawControlPlaneStatus
  lastGatewayError: string | null
  lastRecoveryReason: null
}

export interface OpenClawAgentEntry extends GatewayAgentEntry {
  role?: BrowserOSAgentRoleSummary
}

export interface SetupInput {
  providerType?: string
  providerName?: string
  baseUrl?: string
  apiKey?: string
  modelId?: string
}

export class OpenClawService {
  private runtime: ContainerRuntime
  private gateway: GatewayClient | null = null
  private openclawDir: string
  private port = OPENCLAW_GATEWAY_PORT
  private token: string
  private lastError: string | null = null
  private browserosServerPort: number
  private controlPlaneStatus: OpenClawControlPlaneStatus = 'disconnected'
  private lastGatewayError: string | null = null
  private gatewayReconnectPromise: Promise<void> | null = null
  private stopLogTail: (() => void) | null = null

  constructor(browserosServerPort?: number) {
    this.openclawDir = getOpenClawDir()
    this.runtime = new ContainerRuntime(getPodmanRuntime(), this.openclawDir)
    this.token = crypto.randomUUID()
    this.browserosServerPort = browserosServerPort ?? DEFAULT_PORTS.server
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async setup(input: SetupInput, onLog?: (msg: string) => void): Promise<void> {
    const logProgress = this.createProgressLogger(onLog)
    logger.info('Starting OpenClaw setup', {
      port: this.port,
      browserosServerPort: this.browserosServerPort,
      providerType: input.providerType,
      providerName: input.providerName,
      hasBaseUrl: !!input.baseUrl,
      hasModel: !!input.modelId,
      hasApiKey: !!input.apiKey,
    })

    logProgress('Checking container runtime...')
    const available = await this.runtime.isPodmanAvailable()
    if (!available) {
      throw new Error(
        'Podman is not available. Install Podman to use OpenClaw agents.',
      )
    }

    await this.runtime.ensureReady(logProgress)
    logProgress('Container runtime ready')

    await mkdir(this.openclawDir, { recursive: true })
    await mkdir(join(this.openclawDir, 'workspace'), { recursive: true })

    logProgress('Copying compose file...')
    await this.runtime.copyComposeFile(COMPOSE_RESOURCE)

    this.token = crypto.randomUUID()
    const providerKeys = resolveProviderKeys(input)
    const envContent = buildEnvFile({
      token: this.token,
      configDir: this.openclawDir,
      providerKeys,
    })
    await this.runtime.writeEnvFile(envContent)
    logProgress('Generated .env file')
    logger.info('Wrote OpenClaw env file', {
      providerKeyCount: Object.keys(providerKeys).length,
    })

    const config = buildBootstrapConfig({
      gatewayPort: this.port,
      gatewayToken: this.token,
      browserosServerPort: this.browserosServerPort,
      providerType: input.providerType,
      providerName: input.providerName,
      baseUrl: input.baseUrl,
      modelId: input.modelId,
    })
    await this.writeBootstrapConfig(config)
    logProgress('Generated openclaw.json')
    logger.info('Generated OpenClaw bootstrap config')

    logProgress('Pulling OpenClaw image...')
    await this.runtime.composePull(logProgress)
    logProgress('Image ready')

    logProgress('Starting OpenClaw gateway...')
    await this.runtime.composeUp(logProgress)
    this.startGatewayLogTail()

    logProgress('Waiting for gateway readiness...')
    const ready = await this.runtime.waitForReady(this.port, READY_TIMEOUT_MS)
    if (!ready) {
      this.lastError = 'Gateway did not become ready within 30 seconds'
      const logs = await this.runtime.composeLogs()
      logger.error('Gateway readiness check failed', { logs })
      throw new Error(this.lastError)
    }

    logProgress('Connecting to gateway...')
    await this.connectGatewayResiliently()

    // Ensure main agent exists (gateway may auto-create it)
    // biome-ignore lint/style/noNonNullAssertion: gateway is guaranteed connected after connectGateway()
    const existingAgents = await this.gateway!.listAgents()
    logger.info('Fetched existing OpenClaw agents after setup', {
      count: existingAgents.length,
      names: existingAgents.map((agent) => agent.name),
    })
    const hasMain = existingAgents.some((a) => a.agentId === 'main')
    if (!hasMain) {
      logProgress('Creating main agent...')
      const model = resolveProviderModel(input)
      // biome-ignore lint/style/noNonNullAssertion: gateway is connected
      await this.gateway!.createAgent({
        name: 'main',
        workspace: GatewayClient.agentWorkspace('main'),
        model,
      })
    } else {
      logProgress('Main agent already exists')
    }

    this.lastError = null
    logProgress(`OpenClaw gateway running at http://127.0.0.1:${this.port}`)
    logger.info('OpenClaw setup complete', { port: this.port })
  }

  async start(onLog?: (msg: string) => void): Promise<void> {
    const logProgress = this.createProgressLogger(onLog)
    logger.info('Starting OpenClaw service', {
      port: this.port,
    })

    await this.ensureDevLoggingInConfig()
    await this.runtime.ensureReady(logProgress)
    logProgress('Starting OpenClaw gateway...')
    await this.runtime.composeUp(logProgress)
    this.startGatewayLogTail()

    logProgress('Waiting for gateway readiness...')
    const ready = await this.runtime.waitForReady(this.port, READY_TIMEOUT_MS)
    if (!ready) {
      this.lastError = 'Gateway did not become ready after start'
      throw new Error(this.lastError)
    }

    logProgress('Connecting to gateway...')
    await this.connectGatewayResiliently()
    this.lastError = null
    logger.info('OpenClaw gateway started', { port: this.port })
  }

  async stop(): Promise<void> {
    logger.info('Stopping OpenClaw service', { port: this.port })
    this.disconnectGateway()
    this.stopGatewayLogTail()
    await this.runtime.composeStop()
    logger.info('OpenClaw container stopped')
  }

  async restart(onLog?: (msg: string) => void): Promise<void> {
    const logProgress = this.createProgressLogger(onLog)
    logger.info('Restarting OpenClaw service', {
      port: this.port,
    })

    this.disconnectGateway()
    this.stopGatewayLogTail()
    await this.ensureDevLoggingInConfig()
    logProgress('Restarting OpenClaw gateway...')
    await this.runtime.composeRestart(logProgress)
    this.startGatewayLogTail()

    logProgress('Waiting for gateway readiness...')
    const ready = await this.runtime.waitForReady(this.port, READY_TIMEOUT_MS)
    if (!ready) {
      this.lastError = 'Gateway did not become ready after restart'
      throw new Error(this.lastError)
    }

    logProgress('Connecting to gateway...')
    await this.connectGatewayResiliently()
    this.lastError = null
    logProgress('Gateway restarted successfully')
    logger.info('OpenClaw gateway restarted', { port: this.port })
  }

  async reconnectControlPlane(onLog?: (msg: string) => void): Promise<void> {
    const logProgress = this.createProgressLogger(onLog)
    logger.info('Reconnecting OpenClaw control plane', { port: this.port })

    logProgress('Checking gateway readiness...')
    const ready = await this.runtime.isReady(this.port)
    if (!ready) {
      this.controlPlaneStatus = 'failed'
      this.lastGatewayError = 'OpenClaw gateway is not ready'
      throw new Error('OpenClaw gateway is not ready')
    }

    this.disconnectGateway()

    logProgress('Reconnecting control plane...')
    await this.ensureGatewayReady()
    logProgress('Control plane connected')
  }

  async shutdown(): Promise<void> {
    this.disconnectGateway()
    this.stopGatewayLogTail()
    try {
      await this.runtime.composeStop()
    } catch {
      // Best effort during shutdown
    }
    await this.runtime.stopMachineIfSafe()
    logger.info('OpenClaw shutdown complete')
  }

  // ── Status ───────────────────────────────────────────────────────────

  async getStatus(): Promise<OpenClawStatusResponse> {
    const podmanAvailable = await this.runtime.isPodmanAvailable()
    if (!podmanAvailable) {
      return {
        status: 'uninitialized',
        podmanAvailable: false,
        machineReady: false,
        port: null,
        agentCount: 0,
        error: null,
        controlPlaneStatus: 'disconnected',
        lastGatewayError: null,
        lastRecoveryReason: null,
      }
    }

    const isSetUp = existsSync(join(this.openclawDir, OPENCLAW_CONFIG_FILE))
    if (!isSetUp) {
      const machineStatus = await this.runtime.getMachineStatus()
      return {
        status: 'uninitialized',
        podmanAvailable: true,
        machineReady: machineStatus.running,
        port: null,
        agentCount: 0,
        error: null,
        controlPlaneStatus: 'disconnected',
        lastGatewayError: this.lastGatewayError,
        lastRecoveryReason: null,
      }
    }

    const machineStatus = await this.runtime.getMachineStatus()
    const ready = machineStatus.running
      ? await this.runtime.isReady(this.port)
      : false

    let agentCount = 0
    if (ready && this.gateway?.isConnected) {
      try {
        const agents = await this.gateway.listAgents()
        agentCount = agents.length
      } catch {
        // WS may be momentarily unavailable
      }
    }

    return {
      status: ready ? 'running' : this.lastError ? 'error' : 'stopped',
      podmanAvailable: true,
      machineReady: machineStatus.running,
      port: this.port,
      agentCount,
      error: this.lastError,
      controlPlaneStatus: ready
        ? this.gateway?.isConnected
          ? 'connected'
          : this.controlPlaneStatus
        : 'disconnected',
      lastGatewayError: this.lastGatewayError,
      lastRecoveryReason: null,
    }
  }

  // ── Agent Management (via WS RPC) ───────────────────────────────────

  async createAgent(input: {
    name: string
    roleId?: BrowserOSAgentRoleId
    customRole?: BrowserOSCustomRoleInput
    providerType?: string
    providerName?: string
    baseUrl?: string
    apiKey?: string
    modelId?: string
  }): Promise<OpenClawAgentEntry> {
    const { name } = input
    if (!AGENT_NAME_PATTERN.test(name)) {
      throw new OpenClawInvalidAgentNameError()
    }

    logger.debug('Creating OpenClaw agent', {
      name,
      roleId: input.roleId,
      roleSource: input.customRole ? 'custom' : input.roleId ? 'builtin' : null,
      providerType: input.providerType,
      providerName: input.providerName,
      hasBaseUrl: !!input.baseUrl,
      hasModel: !!input.modelId,
      hasApiKey: !!input.apiKey,
    })
    await this.ensureGatewayReady()

    const configChanged = await this.mergeProviderConfigIfChanged(input)
    const keysChanged =
      input.providerType && input.apiKey
        ? await this.mergeProviderKeyIfChanged(input)
        : false

    if (configChanged || keysChanged) {
      logger.info('OpenClaw provider config changed while creating agent', {
        name,
        configChanged,
        keysChanged,
      })
      await this.restart()
    }

    const model = resolveProviderModel(input)

    const gateway = this.gateway
    if (!gateway) {
      throw new Error('Gateway WS not connected')
    }

    let agent: GatewayAgentEntry
    try {
      agent = await gateway.createAgent({
        name,
        workspace: GatewayClient.agentWorkspace(name),
        model,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('already exists')) {
        throw new OpenClawAgentAlreadyExistsError(name)
      }
      throw error
    }

    if (input.roleId || input.customRole) {
      await this.writeRoleBootstrapFiles(
        name,
        input.roleId ? resolveRoleTemplate(input.roleId) : input.customRole!,
      )
    }

    const roleSummary = input.roleId
      ? toRoleSummary(resolveRoleTemplate(input.roleId))
      : input.customRole
        ? toRoleSummary(input.customRole)
        : undefined

    logger.info('Agent created via WS RPC', {
      agentId: agent.agentId,
      roleId: input.roleId,
      roleSource: roleSummary?.roleSource,
      providerType: input.providerType,
    })
    return {
      ...agent,
      role: roleSummary,
    }
  }

  async removeAgent(agentId: string): Promise<void> {
    logger.info('Removing OpenClaw agent', { agentId })
    if (agentId === 'main') {
      throw new OpenClawProtectedAgentError('Cannot delete the main agent')
    }

    await this.ensureGatewayReady()
    try {
      // biome-ignore lint/style/noNonNullAssertion: ensureGatewayReady() guarantees a connected client
      await this.gateway!.deleteAgent(agentId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('not found')) {
        throw new OpenClawAgentNotFoundError(agentId)
      }
      throw error
    }
    logger.info('Agent removed via WS RPC', { agentId })
  }

  async listAgents(): Promise<OpenClawAgentEntry[]> {
    await this.ensureGatewayReady()
    logger.debug('Listing OpenClaw agents')
    // biome-ignore lint/style/noNonNullAssertion: ensureGatewayReady() guarantees a connected client
    const agents = await this.gateway!.listAgents()
    return Promise.all(
      agents.map(async (agent) => ({
        ...agent,
        role: await this.readRoleSummary(agent.name),
      })),
    )
  }

  // ── Chat Stream (HTTP SSE) ───────────────────────────────────────────

  async chatStream(
    agentId: string,
    sessionKey: string,
    message: string,
  ): Promise<ReadableStream<OpenClawStreamEvent>> {
    await this.ensureGatewayReady()
    logger.info('Starting OpenClaw chat stream', {
      agentId,
      sessionKey,
      messageLength: message.length,
    })
    return chatStreamHttp({
      httpBase: `http://127.0.0.1:${this.port}`,
      agentId,
      sessionKey,
      message,
    })
  }

  // ── Provider Keys ────────────────────────────────────────────────────

  async updateProviderKeys(input: {
    providerType: string
    providerName?: string
    baseUrl?: string
    apiKey: string
    modelId?: string
  }): Promise<void> {
    await this.mergeProviderConfigIfChanged(input)
    await this.mergeProviderKeyIfChanged(input)
    await this.restart()
    logger.info('Provider keys updated', { providerType: input.providerType })
  }

  // ── Logs ─────────────────────────────────────────────────────────────

  async getLogs(tail = 100): Promise<string[]> {
    logger.debug('Fetching OpenClaw container logs', { tail })
    return this.runtime.composeLogs(tail)
  }

  // ── Auto-start on BrowserOS boot ────────────────────────────────────

  async tryAutoStart(): Promise<void> {
    const isSetUp = existsSync(join(this.openclawDir, OPENCLAW_CONFIG_FILE))
    if (!isSetUp) return

    const available = await this.runtime.isPodmanAvailable()
    if (!available) return

    logger.info('Attempting OpenClaw auto-start', { port: this.port })

    try {
      await this.runtime.ensureReady()

      if (!(await this.runtime.isReady(this.port))) {
        await this.runtime.composeUp()
        const ready = await this.runtime.waitForReady(
          this.port,
          READY_TIMEOUT_MS,
        )
        if (!ready) {
          logger.warn('OpenClaw gateway failed to become ready on auto-start')
          return
        }
      }

      await this.connectGatewayResiliently()
      logger.info('OpenClaw gateway auto-started')
    } catch (err) {
      logger.warn('OpenClaw auto-start failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async connectGatewayResiliently(): Promise<void> {
    this.controlPlaneStatus = 'connecting'
    this.lastGatewayError = null
    try {
      logger.info('Connecting OpenClaw control plane', { port: this.port })
      const client = await connectWithRetry(this.port, this.openclawDir)
      this.gateway = client
      this.controlPlaneStatus = 'connected'
      logger.info('OpenClaw gateway control plane connected', {
        port: this.port,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.lastGatewayError = msg
      this.controlPlaneStatus = 'failed'
      throw err
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private disconnectGateway(): void {
    if (this.gateway) {
      this.gateway.disconnect()
      this.gateway = null
    }
    this.controlPlaneStatus = 'disconnected'
  }

  private async ensureGatewayReady(): Promise<void> {
    if (this.gateway?.isConnected) {
      this.controlPlaneStatus = 'connected'
      return
    }

    const portReady = await this.runtime.isReady(this.port)
    logger.info('Checking OpenClaw gateway readiness before WS use', {
      port: this.port,
      portReady,
      hasGatewayClient: !!this.gateway,
      gatewayConnected: !!this.gateway?.isConnected,
    })
    if (!portReady) {
      this.controlPlaneStatus = 'failed'
      this.lastGatewayError = 'OpenClaw gateway is not ready'
      throw new Error('OpenClaw gateway is not ready')
    }

    if (this.gatewayReconnectPromise) {
      await this.gatewayReconnectPromise
      return
    }

    this.gatewayReconnectPromise = this.connectGatewayResiliently()
    try {
      await this.gatewayReconnectPromise
    } finally {
      this.gatewayReconnectPromise = null
    }
  }

  private async writeBootstrapConfig(
    config: Record<string, unknown>,
  ): Promise<void> {
    const configPath = join(this.openclawDir, OPENCLAW_CONFIG_FILE)
    await writeFile(configPath, JSON.stringify(config, null, 2))
    logger.info('Persisted OpenClaw bootstrap config')
  }

  private async ensureDevLoggingInConfig(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') return
    const configPath = join(this.openclawDir, OPENCLAW_CONFIG_FILE)
    if (!existsSync(configPath)) return
    try {
      const raw = await readFile(configPath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const existing = (parsed.logging ?? {}) as Record<string, unknown>
      if (existing.level === 'debug' && existing.consoleLevel === 'debug') {
        return
      }
      parsed.logging = { ...existing, level: 'debug', consoleLevel: 'debug' }
      await writeFile(configPath, JSON.stringify(parsed, null, 2))
      logger.info('Patched openclaw.json for dev debug logging')
    } catch (err) {
      logger.warn('Failed to patch openclaw.json for dev debug logging', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private startGatewayLogTail(): void {
    if (process.env.NODE_ENV !== 'development') return
    if (this.stopLogTail) return
    try {
      this.stopLogTail = this.runtime.tailGatewayLogs((line) => {
        logger.debug(`[openclaw] ${line}`)
      })
      logger.info('Streaming OpenClaw gateway logs into server log (dev mode)')
    } catch (err) {
      logger.warn('Failed to start OpenClaw gateway log tail', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private stopGatewayLogTail(): void {
    if (!this.stopLogTail) return
    try {
      this.stopLogTail()
    } catch {
      // best effort
    }
    this.stopLogTail = null
  }

  private getHostWorkspaceDir(agentName: string): string {
    return join(
      this.openclawDir,
      agentName === 'main' ? 'workspace' : `workspace-${agentName}`,
    )
  }

  private async writeRoleBootstrapFiles(
    agentName: string,
    role: ReturnType<typeof resolveRoleTemplate> | BrowserOSCustomRoleInput,
  ): Promise<void> {
    const workspaceDir = this.getHostWorkspaceDir(agentName)
    const files = buildRoleBootstrapFiles({ role, agentName })

    await mkdir(workspaceDir, { recursive: true })
    await Promise.all(
      Object.entries(files).map(([filename, content]) =>
        writeFile(join(workspaceDir, filename), content),
      ),
    )

    logger.info('Wrote BrowserOS role bootstrap files', {
      agentName,
      roleSource: 'id' in role ? 'builtin' : 'custom',
      roleId: 'id' in role ? role.id : undefined,
      workspaceDir,
    })
  }

  private async readRoleSummary(
    agentName: string,
  ): Promise<BrowserOSAgentRoleSummary | undefined> {
    const roleMetadataPath = join(
      this.getHostWorkspaceDir(agentName),
      '.browseros-role.json',
    )

    try {
      const content = await readFile(roleMetadataPath, 'utf-8')
      const json = JSON.parse(content) as {
        roleSource?: 'builtin' | 'custom'
        roleId?: BrowserOSAgentRoleId
        roleName?: string
        shortDescription?: string
      }
      if (
        json.roleSource === 'custom' &&
        json.roleName &&
        json.shortDescription
      ) {
        return {
          roleSource: 'custom',
          roleName: json.roleName,
          shortDescription: json.shortDescription,
        }
      }
      if (!json.roleId) return undefined
      const role = resolveRoleTemplate(json.roleId)
      return toRoleSummary(role)
    } catch {
      return undefined
    }
  }

  /**
   * Merges provider credentials into .env. Returns true when the env file
   * changed, meaning the container should restart to pick up the update.
   */
  private async mergeProviderKeyIfChanged(input: {
    providerType?: string
    providerName?: string
    baseUrl?: string
    apiKey?: string
    modelId?: string
  }): Promise<boolean> {
    const newKeys = resolveProviderKeys(input)
    if (Object.keys(newKeys).length === 0) return false

    const envPath = join(this.openclawDir, '.env')
    let content = ''
    try {
      content = await readFile(envPath, 'utf-8')
    } catch {
      // .env may not exist yet
    }

    let addedNew = false
    let updatedExisting = false
    for (const [key, value] of Object.entries(newKeys)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`^${escapedKey}=.*$`, 'm')
      if (pattern.test(content)) {
        content = content.replace(pattern, `${key}=${value}`)
        updatedExisting = true
      } else {
        content = `${content.trimEnd()}\n${key}=${value}\n`
        addedNew = true
      }
    }

    await writeFile(envPath, content, { mode: 0o600 })
    logger.debug('Updated OpenClaw provider credentials', {
      providerType: input.providerType,
      addedNew,
      updatedExisting,
    })
    return addedNew || updatedExisting
  }

  private async mergeProviderConfigIfChanged(input: {
    providerType?: string
    providerName?: string
    baseUrl?: string
    modelId?: string
  }): Promise<boolean> {
    if (
      !input.providerType ||
      !input.baseUrl ||
      input.providerType in PROVIDER_ENV_MAP
    ) {
      return false
    }

    const configPath = join(this.openclawDir, OPENCLAW_CONFIG_FILE)
    let content = ''
    try {
      content = await readFile(configPath, 'utf-8')
    } catch {
      return false
    }

    const config = JSON.parse(content) as Record<string, unknown>
    const models = (config.models ?? {}) as Record<string, unknown>
    const providers = ((models.providers as
      | Record<string, unknown>
      | undefined) ?? {}) as Record<string, Record<string, unknown>>

    const providerId = deriveOpenClawProviderId(input)
    const existingProvider = providers[providerId] ?? {}
    const nextProvider: Record<string, unknown> = {
      ...existingProvider,
      baseUrl: input.baseUrl,
      apiKey:
        existingProvider.apiKey ??
        `\${${deriveOpenClawApiKeyEnvVar(providerId)}}`,
    }

    if (!existingProvider.api) {
      nextProvider.api = 'openai-completions'
    }

    if (input.modelId) {
      const existingModels = Array.isArray(existingProvider.models)
        ? (existingProvider.models as Array<Record<string, unknown>>)
        : []
      const hasModel = existingModels.some(
        (model) => model.id === input.modelId || model.name === input.modelId,
      )
      if (!hasModel) {
        nextProvider.models = [
          ...existingModels,
          { id: input.modelId, name: input.modelId },
        ]
      }
    }

    if (
      JSON.stringify(existingProvider) === JSON.stringify(nextProvider) &&
      models.mode === 'merge'
    ) {
      return false
    }

    config.models = {
      ...models,
      mode: 'merge',
      providers: {
        ...providers,
        [providerId]: nextProvider,
      },
    }
    await this.writeBootstrapConfig(config)
    logger.debug('Updated OpenClaw provider config', {
      providerId,
      providerType: input.providerType,
      hasModel: !!input.modelId,
    })
    return true
  }

  private createProgressLogger(
    onLog?: (msg: string) => void,
  ): (msg: string) => void {
    return (msg) => {
      logger.debug(`OpenClaw: ${msg}`)
      onLog?.(msg)
    }
  }
}

let service: OpenClawService | null = null

export function getOpenClawService(
  browserosServerPort?: number,
): OpenClawService {
  if (!service) service = new OpenClawService(browserosServerPort)
  return service
}
