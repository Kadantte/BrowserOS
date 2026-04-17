import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { BrowserOsStoredAgent } from '@browseros/shared/types/browseros-agents'

type MutableOpenClawService = {
  getStatus: ReturnType<typeof mock>
  createAgent: ReturnType<typeof mock>
  removeAgent: ReturnType<typeof mock>
  chatStream: ReturnType<typeof mock>
}

describe('OpenClawAgentAdapter', () => {
  let service: MutableOpenClawService

  beforeEach(() => {
    service = {
      getStatus: mock(async () => ({
        status: 'running',
        podmanAvailable: true,
        machineReady: true,
        port: 18789,
        agentCount: 1,
        error: null,
        controlPlaneStatus: 'connected',
        lastGatewayError: null,
        lastRecoveryReason: null,
      })),
      createAgent: mock(async () => ({
        agentId: 'ops',
        name: 'ops',
        workspace: '/workspace/ops',
        model: 'openclaw/ops',
      })),
      removeAgent: mock(async () => {}),
      chatStream: mock(
        async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: 'text-delta',
                data: { text: 'Hello' },
              })
              controller.enqueue({
                type: 'text-delta',
                data: { text: ' world' },
              })
              controller.enqueue({
                type: 'done',
                data: { text: 'Hello world' },
              })
              controller.close()
            },
          }),
      ),
    }
  })

  afterEach(() => {
    mock.restore()
  })

  it('rejects create when OpenClaw is not ready', async () => {
    service.getStatus = mock(async () => ({
      status: 'starting',
      podmanAvailable: true,
      machineReady: true,
      port: 18789,
      agentCount: 0,
      error: null,
      controlPlaneStatus: 'connecting',
      lastGatewayError: null,
      lastRecoveryReason: null,
    }))

    const { OpenClawAgentAdapter } = await import(
      '../../../../src/api/services/agents/adapters/openclaw-adapter'
    )
    const adapter = new OpenClawAgentAdapter(service as never)

    await expect(
      adapter.validateCreate({
        id: 'ops',
        name: 'Ops',
        adapterType: 'openclaw',
      }),
    ).rejects.toThrow('OpenClaw must be running with a connected control plane')
  })

  it('materializes, removes, and streams via OpenClaw', async () => {
    const { OpenClawAgentAdapter } = await import(
      '../../../../src/api/services/agents/adapters/openclaw-adapter'
    )
    const adapter = new OpenClawAgentAdapter(service as never)

    const materialized = await adapter.materialize({
      id: 'ops',
      name: 'Ops',
      adapterType: 'openclaw',
      providerType: 'openai',
      providerName: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-key',
      modelId: 'gpt-4o-mini',
    })

    expect(service.createAgent).toHaveBeenCalledWith({
      name: 'ops',
      providerType: 'openai',
      providerName: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-key',
      modelId: 'gpt-4o-mini',
    })
    expect(materialized).toEqual({
      runtimeBinding: {
        agentId: 'ops',
        workspace: '/workspace/ops',
        model: 'openclaw/ops',
      },
      adapterConfig: {
        providerType: 'openai',
        providerName: 'openai',
        baseUrl: 'https://api.example.com/v1',
        modelId: 'gpt-4o-mini',
      },
    })

    const record = createStoredAgent({
      runtimeBinding: {
        agentId: 'ops-runtime',
      },
    })

    await adapter.remove(record)
    expect(service.removeAgent).toHaveBeenCalledWith('ops-runtime')

    const stream = await adapter.streamChat(record, {
      sessionKey: 'session-123',
      message: 'hi',
    })
    expect(service.chatStream).toHaveBeenCalledWith(
      'ops-runtime',
      'session-123',
      'hi',
    )
    expect(await readEvents(stream)).toEqual([
      { type: 'start' },
      { type: 'text-start', id: 'ops-runtime-text' },
      { type: 'text-delta', id: 'ops-runtime-text', delta: 'Hello' },
      { type: 'text-delta', id: 'ops-runtime-text', delta: ' world' },
      { type: 'text-end', id: 'ops-runtime-text' },
      { type: 'finish', finishReason: 'stop' },
    ])
  })

  it('preserves thinking, tool, and lifecycle details in normalized chat output', async () => {
    service.chatStream = mock(
      async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'thinking',
              data: { text: 'Inspecting context' },
            })
            controller.enqueue({
              type: 'tool-start',
              data: {
                toolCallId: 'call-1',
                toolName: 'browser.search',
                input: { query: 'BrowserOS' },
              },
            })
            controller.enqueue({
              type: 'tool-output',
              data: {
                toolCallId: 'call-1',
                output: { result: 'ok' },
              },
            })
            controller.enqueue({
              type: 'tool-end',
              data: {
                toolCallId: 'call-1',
                status: 'completed',
              },
            })
            controller.enqueue({
              type: 'lifecycle',
              data: {
                phase: 'retrieval',
                status: 'running',
              },
            })
            controller.enqueue({
              type: 'done',
              data: { text: '' },
            })
            controller.close()
          },
        }),
    )

    const { OpenClawAgentAdapter } = await import(
      '../../../../src/api/services/agents/adapters/openclaw-adapter'
    )
    const adapter = new OpenClawAgentAdapter(service as never)

    const stream = await adapter.streamChat(createStoredAgent(), {
      sessionKey: 'session-456',
      message: 'status',
    })

    expect(await readEvents(stream)).toEqual([
      { type: 'start' },
      { type: 'text-start', id: 'ops-text' },
      { type: 'reasoning-start', id: 'ops-reasoning' },
      {
        type: 'reasoning-delta',
        id: 'ops-reasoning',
        delta: 'Inspecting context',
      },
      {
        type: 'tool-input-start',
        toolCallId: 'call-1',
        toolName: 'browser.search',
      },
      {
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'browser.search',
        input: { query: 'BrowserOS' },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: { result: 'ok' },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: { status: 'completed' },
      },
      {
        type: 'reasoning-delta',
        id: 'ops-reasoning',
        delta: '{"phase":"retrieval","status":"running"}',
      },
      { type: 'reasoning-end', id: 'ops-reasoning' },
      { type: 'text-end', id: 'ops-text' },
      { type: 'finish', finishReason: 'stop' },
    ])
  })
})

function createStoredAgent(
  overrides: Partial<BrowserOsStoredAgent> = {},
): BrowserOsStoredAgent {
  return {
    version: 1,
    id: 'ops',
    name: 'Ops',
    adapterType: 'openclaw',
    paths: {
      agentDir: '/tmp/agent',
      cwd: '/tmp/agent',
      contextDirs: [],
    },
    adapterConfig: {},
    runtimeBinding: {
      agentId: 'ops',
    },
    lastValidation: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function readEvents(
  stream: ReadableStream<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> {
  const reader = stream.getReader()
  const events: Record<string, unknown>[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    events.push(value)
  }
  return events
}
