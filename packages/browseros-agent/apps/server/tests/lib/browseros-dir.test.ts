import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { tmpdir } from 'node:os'

describe('browseros agent path helpers', () => {
  let homeDir: string

  beforeEach(() => {
    homeDir = '/tmp/browseros-agent-path-test'
    mock.module('node:os', () => ({
      homedir: () => homeDir,
      tmpdir,
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('derives managed agent paths under ~/.browseros/agents/<id>', async () => {
    const {
      getAgentsDir,
      getAgentDir,
      getAgentMetadataPath,
      getAgentRuntimeDir,
    } = await import('../../src/lib/browseros-dir')

    expect(getAgentsDir()).toBe(
      '/tmp/browseros-agent-path-test/.browseros/agents',
    )
    expect(getAgentDir('chief-of-staff')).toBe(
      '/tmp/browseros-agent-path-test/.browseros/agents/chief-of-staff',
    )
    expect(getAgentMetadataPath('chief-of-staff')).toBe(
      '/tmp/browseros-agent-path-test/.browseros/agents/chief-of-staff/agent.json',
    )
    expect(getAgentRuntimeDir('chief-of-staff')).toBe(
      '/tmp/browseros-agent-path-test/.browseros/agents/chief-of-staff/runtime',
    )
  })
})
