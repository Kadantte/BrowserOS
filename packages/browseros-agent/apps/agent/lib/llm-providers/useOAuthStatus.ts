import { useCallback, useEffect, useRef, useState } from 'react'
import { getAgentServerUrl } from '@/lib/browseros/helpers'

interface OAuthStatus {
  authenticated: boolean
  email?: string
  provider: string
}

interface UseOAuthStatusReturn {
  status: OAuthStatus | null
  isPolling: boolean
  startPolling: () => void
  stopPolling: () => void
  refresh: () => Promise<OAuthStatus | null>
  disconnect: () => Promise<void>
}

export function useOAuthStatus(provider: string): UseOAuthStatusReturn {
  const [status, setStatus] = useState<OAuthStatus | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async (): Promise<OAuthStatus | null> => {
    try {
      const serverUrl = await getAgentServerUrl()
      const res = await fetch(`${serverUrl}/oauth/${provider}/status`)
      if (!res.ok) return null
      const data = (await res.json()) as OAuthStatus
      setStatus(data)
      return data
    } catch {
      return null
    }
  }, [provider])

  // Initial status check on mount
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    pollIntervalRef.current = null
    pollTimeoutRef.current = null
    setIsPolling(false)
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    setIsPolling(true)

    // Poll for status every 2 seconds
    pollIntervalRef.current = setInterval(async () => {
      const result = await fetchStatus()
      if (result?.authenticated) {
        stopPolling()
      }
    }, 2_000)

    // Stop polling after 5 minutes
    pollTimeoutRef.current = setTimeout(stopPolling, 300_000)
  }, [fetchStatus, stopPolling])

  const disconnect = useCallback(async () => {
    try {
      const serverUrl = await getAgentServerUrl()
      await fetch(`${serverUrl}/oauth/${provider}`, { method: 'DELETE' })
      setStatus({ authenticated: false, provider })
    } catch {
      // Best-effort disconnect
    }
  }, [provider])

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling])

  return {
    status,
    isPolling,
    startPolling,
    stopPolling,
    refresh: fetchStatus,
    disconnect,
  }
}
