import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('AgentRegistryService', () => {
  let homeDir = ''

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'browseros-agents-'))
    mock.module('node:os', () => ({
      homedir: () => homeDir,
      tmpdir,
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('creates a managed agent directory with boot files and metadata', async () => {
    const { AgentRegistryService } = await import(
      '../../../../src/api/services/agents/agent-registry-service'
    )

    const service = new AgentRegistryService()
    await service.create({
      id: 'chief-of-staff',
      name: 'chief-of-staff',
      adapterType: 'codex_local',
      adapterConfig: {
        binaryPath: '/opt/homebrew/bin/codex',
      },
      runtimeBinding: null,
      lastValidation: {
        status: 'ok',
        checkedAt: '2026-04-16T18:30:00.000Z',
        message: 'create validation passed',
      },
    })

    const record = await service.get('chief-of-staff')
    expect(record?.paths.cwd).toBe(
      join(homeDir, '.browseros', 'agents', 'chief-of-staff'),
    )

    const toolsMd = await readFile(
      join(homeDir, '.browseros', 'agents', 'chief-of-staff', 'TOOLS.md'),
      'utf8',
    )
    const heartbeatMd = await readFile(
      join(homeDir, '.browseros', 'agents', 'chief-of-staff', 'HEARTBEAT.md'),
      'utf8',
    )

    expect(toolsMd).toContain('browseros-cli')
    expect(heartbeatMd).toContain('reserved for future')
    expect(record).toMatchObject({
      id: 'chief-of-staff',
      name: 'chief-of-staff',
      adapterType: 'codex_local',
      adapterConfig: {
        binaryPath: '/opt/homebrew/bin/codex',
      },
      runtimeBinding: null,
      lastValidation: {
        status: 'ok',
        checkedAt: '2026-04-16T18:30:00.000Z',
        message: 'create validation passed',
      },
    })
  })

  it('lists stored agents in id order and removes them recursively', async () => {
    const { AgentRegistryService } = await import(
      '../../../../src/api/services/agents/agent-registry-service'
    )

    const service = new AgentRegistryService()
    await service.create({
      id: 'zeta',
      name: 'zeta',
      adapterType: 'claude_local',
    })
    await service.create({
      id: 'alpha',
      name: 'alpha',
      adapterType: 'openclaw',
      runtimeBinding: {
        agentId: 'alpha',
      },
    })

    expect((await service.list()).map((record) => record.id)).toEqual([
      'alpha',
      'zeta',
    ])

    await service.remove('alpha')
    expect(await service.get('alpha')).toBeNull()
    expect((await service.list()).map((record) => record.id)).toEqual(['zeta'])
  })
})
