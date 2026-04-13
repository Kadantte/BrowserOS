import type { TerminalWsData } from '../../services/terminal/terminal-session'

export const TERMINAL_WS_PATH = '/terminal/ws'

interface UpgradeServer {
  upgrade(
    request: Request,
    options: {
      data: TerminalWsData
    },
  ): boolean
}

export function handleTerminalWebSocketRequest(
  request: Request,
  server: UpgradeServer,
): Response | undefined | null {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== TERMINAL_WS_PATH) return null

  const upgradeHeader = request.headers.get('upgrade')
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 })
  }

  const agentId = url.searchParams.get('agentId') || 'main'
  if (server.upgrade(request, { data: { agentId } })) return undefined

  return new Response('WebSocket upgrade failed', { status: 426 })
}
