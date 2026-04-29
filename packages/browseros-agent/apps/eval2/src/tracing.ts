import { SEMRESATTRS_PROJECT_NAME } from '@arizeai/openinference-semantic-conventions'
import { OpenInferenceSimpleSpanProcessor } from '@arizeai/openinference-vercel'
import { trace } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { Resource } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import type { TelemetrySettings } from 'ai'
import type { BenchmarkConfig } from './benchmark-config'
import type { Task } from './types'

const TRACER_NAME = 'browseros.eval2'
const SCREENSHOT_SPAN_NAME = 'eval.step.screenshot'

let provider: NodeTracerProvider | null = null

export function initTracing(config: BenchmarkConfig): void {
  if (!config.phoenix.enabled) {
    console.log('Phoenix tracing disabled in config')
    return
  }
  // resolve auth header (cloud needs Bearer token; local server doesn't)
  const headers: Record<string, string> = {}
  if (config.phoenix.apiKeyEnv) {
    const key = process.env[config.phoenix.apiKeyEnv]
    if (key) {
      headers.Authorization = `Bearer ${key}`
      headers['api-key'] = key
    }
  }
  // boot OTel provider with OpenInference span translation
  provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.phoenix.projectName,
      [SEMRESATTRS_PROJECT_NAME]: config.phoenix.projectName,
    }),
    spanProcessors: [
      new OpenInferenceSimpleSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: `${config.phoenix.endpoint}/v1/traces`,
          headers,
        }),
      }),
    ],
  })
  provider.register()
  console.log(
    `Phoenix tracing enabled (project: ${config.phoenix.projectName}, endpoint: ${config.phoenix.endpoint})`,
  )
}

export function isTracingEnabled(): boolean {
  return provider !== null
}

export function getTaskSessionId(
  task: Task,
  config: BenchmarkConfig,
  runId: string,
): string {
  // strip optional dataset prefix from queryId so the suffix is stable
  const prefix = `${config.phoenix.sessionPrefix}-`
  const taskId = task.queryId.startsWith(prefix)
    ? task.queryId.slice(prefix.length)
    : task.queryId
  return `${runId}-${taskId}`
}

export function getAiSdkTelemetry(
  task: Task,
  config: BenchmarkConfig,
  runId: string,
  conversationId: string,
): TelemetrySettings | undefined {
  if (!provider) return undefined
  const sessionId = getTaskSessionId(task, config, runId)
  return {
    isEnabled: true,
    functionId: 'browseros.eval2.agent',
    metadata: {
      // session.id is OpenInference's grouping key — Phoenix groups spans by it
      'session.id': sessionId,
      runId,
      taskId: task.queryId,
      dataset: task.dataset,
      model: config.model,
      conversationId,
    },
  }
}

export async function withTaskSession<T>(
  task: Task,
  config: BenchmarkConfig,
  runId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!provider) return fn()
  const sessionId = getTaskSessionId(task, config, runId)
  const tracer = trace.getTracer(TRACER_NAME)
  // outer span carries session.id so all nested AI-SDK spans inherit it
  return await tracer.startActiveSpan(
    'eval.task',
    {
      attributes: {
        'openinference.span.kind': 'AGENT',
        'session.id': sessionId,
        'input.value': task.query,
        runId,
        taskId: task.queryId,
        dataset: task.dataset,
      },
    },
    async (span) => {
      try {
        return await fn()
      } finally {
        span.end()
      }
    },
  )
}

export async function recordScreenshotSpan(
  toolCallId: string,
  toolName: string,
  base64: string,
): Promise<void> {
  if (!provider) return
  const tracer = trace.getTracer(TRACER_NAME)
  const span = tracer.startSpan(SCREENSHOT_SPAN_NAME, {
    attributes: {
      'openinference.span.kind': 'INTERNAL',
      'tool.call_id': toolCallId,
      'tool.name': toolName,
      // Phoenix renders data URLs in *.value fields inline
      'output.mime_type': 'image/png',
      'output.value': `data:image/png;base64,${base64}`,
    },
  })
  span.end()
}

export async function flushTracing(): Promise<void> {
  if (!provider) return
  try {
    await provider.forceFlush()
    await provider.shutdown()
  } catch (error) {
    console.warn(
      `Phoenix flush/shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  provider = null
}
