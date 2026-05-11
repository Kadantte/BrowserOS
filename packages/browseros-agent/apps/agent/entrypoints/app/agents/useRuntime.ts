import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRpcClient } from '@/lib/rpc/RpcClientProvider'

export type RuntimeAdapterId = 'claude' | 'codex' | 'hermes' | 'openclaw'

export type RuntimeKind = 'container' | 'host-process'

export type RuntimeState =
  | 'unsupported_platform'
  | 'errored'
  | 'not_installed'
  | 'installing'
  | 'installed'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'cli_missing'
  | 'cli_present'
  | 'cli_unhealthy'

export type RuntimeAction =
  | 'install'
  | 'start'
  | 'stop'
  | 'restart'
  | 'reset-soft'
  | 'reset-wipe-agent'
  | 'reset-hard'
  | 'reinstall-cli'
  | 'check-auth'

export interface RuntimeStatusSnapshot {
  adapterId: string
  state: RuntimeState
  isReady: boolean
  lastError: string | null
  lastErrorAt: number | null
  probedAt?: number | null
  details?: Record<string, unknown>
}

export interface RuntimeView {
  descriptor: {
    adapterId: string
    displayName: string
    kind: RuntimeKind
    platforms: ReadonlyArray<string>
  }
  status: RuntimeStatusSnapshot
  capabilities: ReadonlyArray<string>
}

export const RUNTIME_QUERY_KEYS = {
  list: 'runtimes-list',
  status: (adapter: RuntimeAdapterId) => ['runtime-status', adapter] as const,
  logs: (adapter: RuntimeAdapterId) => ['runtime-logs', adapter] as const,
} as const

export function useRuntimes(opts: { pollMs?: number } = {}) {
  const rpcClient = useRpcClient()
  return useQuery<RuntimeView[], Error>({
    queryKey: [RUNTIME_QUERY_KEYS.list],
    queryFn: async () => {
      const res = await rpcClient.runtimes.$get()
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'runtimes list fetch failed')
      }
      const { runtimes } = (await res.json()) as { runtimes: RuntimeView[] }
      return runtimes
    },
    refetchInterval: opts.pollMs ?? 5_000,
    retry: false,
  })
}

export function useRuntime(
  adapter: RuntimeAdapterId,
  opts: { pollMs?: number; enabled?: boolean } = {},
) {
  const rpcClient = useRpcClient()
  return useQuery<RuntimeView, Error>({
    queryKey: RUNTIME_QUERY_KEYS.status(adapter),
    queryFn: async () => {
      const res = await rpcClient.runtimes[':adapter'].status.$get({
        param: { adapter },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `runtime ${adapter} fetch failed`)
      }
      return (await res.json()) as RuntimeView
    },
    refetchInterval: opts.pollMs ?? 5_000,
    enabled: opts.enabled ?? true,
    retry: false,
  })
}

export function useRuntimeAction(adapter: RuntimeAdapterId) {
  const queryClient = useQueryClient()
  const rpcClient = useRpcClient()
  return useMutation<
    { status: 'ok'; state: RuntimeState },
    Error,
    { action: RuntimeAction; agentId?: string }
  >({
    mutationFn: async ({ action, agentId }) => {
      const res = await rpcClient.runtimes[':adapter'].actions[':action'].$post(
        {
          param: { adapter, action },
          json: agentId ? { agentId } : {},
        },
      )
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `runtime ${adapter} ${action} failed`)
      }
      return (await res.json()) as { status: 'ok'; state: RuntimeState }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: RUNTIME_QUERY_KEYS.status(adapter),
      })
    },
  })
}

export function useRuntimeLogs(
  adapter: RuntimeAdapterId,
  opts: { tail?: number; enabled?: boolean } = {},
) {
  const rpcClient = useRpcClient()
  return useQuery<{ lines: string[] }, Error>({
    queryKey: [...RUNTIME_QUERY_KEYS.logs(adapter), opts.tail ?? 50],
    queryFn: async () => {
      const res = await rpcClient.runtimes[':adapter'].logs.$get({
        param: { adapter },
        query: { tail: opts.tail ? String(opts.tail) : undefined },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `runtime ${adapter} logs failed`)
      }
      return (await res.json()) as { lines: string[] }
    },
    enabled: opts.enabled ?? false,
  })
}
