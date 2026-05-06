import { useQuery } from '@tanstack/react-query'

/** Server-shaped detection result. Mirrors `AcpAgentDetection` on the server. */
export interface AcpAgentDetection {
  agentId: string
  displayName: string
  installed: boolean
  version: string | null
  authenticated: boolean | 'unknown'
  authHint: string | null
  installUrl: string
  acpReady: boolean
  npxBased: boolean
}

interface DetectResponse {
  agents: AcpAgentDetection[]
  cached?: boolean
  error?: string
}

async function fetchAcpAgents(
  agentServerUrl: string,
  fresh: boolean,
): Promise<AcpAgentDetection[]> {
  const url = new URL(`${agentServerUrl}/acp/detect`)
  if (fresh) url.searchParams.set('fresh', '1')
  const response = await fetch(url.toString(), { method: 'POST' })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as DetectResponse
    throw new Error(body.error ?? `Detection failed (HTTP ${response.status})`)
  }
  const data = (await response.json()) as DetectResponse
  return data.agents
}

/**
 * Detect locally-installed ACP agents via the server's `/acp/detect`
 * endpoint. The server caches for 30 s, so this hook stays lightweight
 * even if multiple components mount in parallel.
 */
export function useAcpAgentDetection(
  agentServerUrl: string | null | undefined,
  enabled: boolean,
) {
  return useQuery<AcpAgentDetection[], Error>({
    queryKey: ['acp', 'detect', agentServerUrl],
    queryFn: () => fetchAcpAgents(agentServerUrl ?? '', false),
    enabled: enabled && Boolean(agentServerUrl),
    staleTime: 25_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Force a fresh probe (bypasses the server-side cache). Use for the
 * "Refresh" button so a user who just installed a CLI sees it
 * without waiting out the 30 s cache.
 */
export async function refetchAcpAgentsFresh(
  agentServerUrl: string,
): Promise<AcpAgentDetection[]> {
  return fetchAcpAgents(agentServerUrl, true)
}
