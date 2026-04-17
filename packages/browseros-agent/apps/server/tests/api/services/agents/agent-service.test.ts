import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UIMessageStreamEvent } from '@browseros/shared/schemas/ui-stream'

describe('BrowserOsAgentService', () => {
  let homeDir: string

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'browseros-agent-service-'))
    mock.module('node:os', () => ({
      homedir: () => homeDir,
      tmpdir,
    }))
  })

  afterEach(async () => {
    mock.restore()
    await rm(homeDir, { recursive: true, force: true })
  })

  it('creates agents through the matching adapter and persists adapter config', async () => {
    const { AgentRegistryService } = await import(
      '../../../../src/api/services/agents/agent-registry-service'
    )
    const { BrowserOsAgentService } = await import(
      '../../../../src/api/services/agents/agent-service'
    )

    const validateCreate = mock(async () => {})
    const materialize = mock(async () => ({
      runtimeBinding: null,
      adapterConfig: {
        binaryPath: '/usr/local/bin/codex',
      },
    }))
    const remove = mock(async () => {})
    const streamChat = mock(
      async () =>
        new ReadableStream<UIMessageStreamEvent>({
          start(controller) {
            controller.enqueue({ type: 'start' })
            controller.enqueue({ type: 'finish', finishReason: 'stop' })
            controller.close()
          },
        }),
    )
    const registry = new AgentRegistryService()
    const service = new BrowserOsAgentService({
      registry,
      adapters: [
        {
          adapterType: 'codex_local',
          validateCreate,
          materialize,
          remove,
          streamChat,
        } as never,
      ],
      openClawService: {} as never,
    })

    const created = await service.create({
      id: 'codex-agent',
      name: 'codex-agent',
      adapterType: 'codex_local',
      binaryPath: '/usr/local/bin/codex',
    })

    expect(service.catalog()).toEqual([
      { adapterType: 'codex_local', label: 'Codex Local' },
    ])
    expect(validateCreate).toHaveBeenCalledWith({
      id: 'codex-agent',
      name: 'codex-agent',
      adapterType: 'codex_local',
      binaryPath: '/usr/local/bin/codex',
    })
    expect(created.adapterConfig).toEqual({
      binaryPath: '/usr/local/bin/codex',
    })
    expect((await registry.get('codex-agent'))?.adapterConfig).toEqual({
      binaryPath: '/usr/local/bin/codex',
    })
  })

  it('rolls back the registry record when materialize fails', async () => {
    const { AgentRegistryService } = await import(
      '../../../../src/api/services/agents/agent-registry-service'
    )
    const { BrowserOsAgentService } = await import(
      '../../../../src/api/services/agents/agent-service'
    )

    const remove = mock(async () => {})
    const registry = new AgentRegistryService()
    const service = new BrowserOsAgentService({
      registry,
      adapters: [
        {
          adapterType: 'claude_local',
          validateCreate: mock(async () => {}),
          materialize: mock(async () => {
            throw new Error('materialize failed')
          }),
          remove,
          streamChat: mock(async () => {
            throw new Error('not used')
          }),
        } as never,
      ],
      openClawService: {} as never,
    })

    await expect(
      service.create({
        id: 'claude-agent',
        name: 'claude-agent',
        adapterType: 'claude_local',
        binaryPath: '/usr/local/bin/claude',
      }),
    ).rejects.toThrow('materialize failed')

    expect(remove).toHaveBeenCalledTimes(1)
    expect(await registry.get('claude-agent')).toBeNull()
  })
})
