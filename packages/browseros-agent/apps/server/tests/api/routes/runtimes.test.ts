/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createRuntimeRoutes } from '../../../src/api/routes/runtimes'
import {
  type AgentRuntime,
  ContainerAgentRuntime,
  getAgentRuntimeRegistry,
  resetAgentRuntimeRegistry,
} from '../../../src/lib/agents/runtime'
import type { ManagedContainerDeps } from '../../../src/lib/container/managed'
import type {
  ContainerInfo,
  ContainerSpec,
} from '../../../src/lib/container/types'

interface FakeRuntimeOpts {
  adapterId: string
  kind: 'container' | 'host-process'
  capabilities?: ReadonlyArray<string>
  state?:
    | 'not_installed'
    | 'installing'
    | 'installed'
    | 'starting'
    | 'running'
    | 'stopped'
    | 'errored'
    | 'cli_missing'
    | 'cli_present'
    | 'cli_unhealthy'
    | 'unsupported_platform'
  isReady?: boolean
  executeAction?: (action: { type: string; agentId?: string }) => Promise<void>
  getLogs?: () => Promise<string[]>
}

function makeFakeRuntime(opts: FakeRuntimeOpts): AgentRuntime {
  const subscribers = new Set<(snap: unknown) => void>()
  const snapshot = {
    adapterId: opts.adapterId,
    state: opts.state ?? 'running',
    isReady: opts.isReady ?? true,
    lastError: null,
    lastErrorAt: null,
  }
  const runtime: AgentRuntime = {
    descriptor: {
      adapterId: opts.adapterId,
      displayName: opts.adapterId,
      kind: opts.kind,
      platforms: ['darwin'],
    },
    getStatusSnapshot: () => ({ ...snapshot }),
    subscribe: (listener) => {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    getCapabilities: () =>
      opts.capabilities ??
      (opts.kind === 'container'
        ? ['install', 'start', 'stop', 'restart', 'reset-soft', 'logs']
        : ['reinstall-cli', 'check-auth']),
    executeAction:
      opts.executeAction ??
      (async () => {
        /* noop */
      }),
    buildExecArgv: () => '',
    getPerAgentHomeDir: () => '/tmp',
  }
  return runtime
}

function makeContainerLikeRuntime(
  opts: FakeRuntimeOpts & {
    getLogs: () => Promise<string[]>
  },
): ContainerAgentRuntime {
  // Create a real ContainerAgentRuntime subclass instance so the
  // route's `instanceof ContainerAgentRuntime` check passes.
  const fakeCli = {
    inspectContainer: async (): Promise<ContainerInfo | null> => null,
    removeContainer: async () => {},
    waitForContainerNameRelease: async () => {},
    createContainer: async () => {},
    startContainer: async () => {},
    waitForContainerRunning: async () => {},
    exec: async () => 0,
    runCommand: async (args: string[], onLog?: (line: string) => void) => {
      const lines = await opts.getLogs()
      for (const line of lines) onLog?.(line)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
    tailLogs: () => () => {},
    containerImageRef: async () => null,
  }
  const deps: ManagedContainerDeps = {
    cli: fakeCli as unknown as ManagedContainerDeps['cli'],
    loader: {} as ManagedContainerDeps['loader'],
    vm: {} as ManagedContainerDeps['vm'],
    limactlPath: '/x',
    limaHome: '/x',
    vmName: 'vm',
    lockDir: '/tmp',
  }
  class FakeContainerRuntime extends ContainerAgentRuntime {
    readonly descriptor = {
      adapterId: opts.adapterId,
      displayName: opts.adapterId,
      kind: 'container' as const,
      defaultImage: 'docker.io/x:latest',
      containerName: `${opts.adapterId}-test`,
      platforms: ['darwin' as NodeJS.Platform],
    }
    getPerAgentHomeDir() {
      return '/tmp'
    }
    protected mountRoots() {
      return []
    }
    protected async buildContainerSpec(): Promise<ContainerSpec> {
      return {
        name: this.descriptor.containerName,
        image: this.descriptor.defaultImage,
      }
    }
    protected async readinessProbe() {
      return true
    }
    override getCapabilities() {
      return (opts.capabilities ?? ['logs', 'start', 'stop']) as ReturnType<
        ContainerAgentRuntime['getCapabilities']
      >
    }
  }
  return new FakeContainerRuntime(deps)
}

describe('createRuntimeRoutes', () => {
  beforeEach(() => {
    resetAgentRuntimeRegistry()
  })

  afterEach(() => {
    resetAgentRuntimeRegistry()
  })

  function registry() {
    return getAgentRuntimeRegistry()
  }

  describe('GET /', () => {
    it('returns descriptor + status + capabilities for every registered runtime', async () => {
      registry().register(
        makeFakeRuntime({ adapterId: 'claude', kind: 'host-process' }),
      )
      registry().register(
        makeFakeRuntime({ adapterId: 'hermes', kind: 'container' }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/')
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        runtimes: Array<{ descriptor: { adapterId: string } }>
      }
      expect(body.runtimes.map((r) => r.descriptor.adapterId).sort()).toEqual([
        'claude',
        'hermes',
      ])
    })
  })

  describe('GET /:adapter/status', () => {
    it('returns 200 with the runtime view for a registered adapter', async () => {
      registry().register(
        makeFakeRuntime({ adapterId: 'claude', kind: 'host-process' }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/claude/status')
      expect(res.status).toBe(200)
      const body = (await res.json()) as { capabilities: string[] }
      expect(body.capabilities).toContain('reinstall-cli')
    })

    it('returns 404 for an unknown adapter', async () => {
      const route = createRuntimeRoutes()
      const res = await route.request('/unknown/status')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /:adapter/actions/:action', () => {
    it('dispatches executeAction and returns the new state', async () => {
      const calls: Array<{ type: string }> = []
      registry().register(
        makeFakeRuntime({
          adapterId: 'hermes',
          kind: 'container',
          capabilities: ['start', 'stop'],
          executeAction: async (action) => {
            calls.push(action)
          },
        }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/hermes/actions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      expect(calls).toEqual([{ type: 'start' }])
    })

    it('returns 405 when the action is not in capabilities', async () => {
      registry().register(
        makeFakeRuntime({
          adapterId: 'claude',
          kind: 'host-process',
          capabilities: ['check-auth'],
        }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/claude/actions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(405)
    })

    it('rejects unknown actions with 400', async () => {
      registry().register(
        makeFakeRuntime({ adapterId: 'claude', kind: 'host-process' }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/claude/actions/explode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('requires agentId for reset-wipe-agent', async () => {
      registry().register(
        makeFakeRuntime({
          adapterId: 'hermes',
          kind: 'container',
          capabilities: ['reset-wipe-agent'],
        }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/hermes/actions/reset-wipe-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('passes agentId through to executeAction for reset-wipe-agent', async () => {
      const calls: Array<{ type: string; agentId?: string }> = []
      registry().register(
        makeFakeRuntime({
          adapterId: 'hermes',
          kind: 'container',
          capabilities: ['reset-wipe-agent'],
          executeAction: async (action) => {
            calls.push(action)
          },
        }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/hermes/actions/reset-wipe-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent-7' }),
      })
      expect(res.status).toBe(200)
      expect(calls).toEqual([{ type: 'reset-wipe-agent', agentId: 'agent-7' }])
    })

    it('returns 500 when executeAction throws', async () => {
      registry().register(
        makeFakeRuntime({
          adapterId: 'hermes',
          kind: 'container',
          capabilities: ['start'],
          executeAction: async () => {
            throw new Error('container is on fire')
          },
        }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/hermes/actions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string }
      expect(body.error).toMatch(/on fire/)
    })
  })

  describe('GET /:adapter/logs', () => {
    it('returns log lines for container runtimes', async () => {
      registry().register(
        makeContainerLikeRuntime({
          adapterId: 'hermes',
          kind: 'container',
          getLogs: async () => ['line-a', 'line-b'],
        }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/hermes/logs?tail=20')
      expect(res.status).toBe(200)
      const body = (await res.json()) as { lines: string[] }
      expect(body.lines).toEqual(['line-a', 'line-b'])
    })

    it('returns 405 for host-process runtimes (no container logs)', async () => {
      registry().register(
        makeFakeRuntime({ adapterId: 'claude', kind: 'host-process' }),
      )
      const route = createRuntimeRoutes()
      const res = await route.request('/claude/logs')
      expect(res.status).toBe(405)
    })
  })
})
