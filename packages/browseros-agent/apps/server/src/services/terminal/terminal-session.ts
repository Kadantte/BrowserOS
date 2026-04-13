import type { ServerWebSocket } from 'bun'
import { logger } from '../../lib/logger'

const CONTAINER_HOME = '/home/node/.openclaw'

export interface TerminalWsData {
  agentId: string
}

interface Session {
  proc: ReturnType<typeof Bun.spawn>
}

export class TerminalSessionManager {
  private sessions = new Map<ServerWebSocket<TerminalWsData>, Session>()

  create(
    ws: ServerWebSocket<TerminalWsData>,
    podmanPath: string,
    containerName: string,
  ): void {
    const { agentId } = ws.data
    const workspace =
      agentId === 'main'
        ? `${CONTAINER_HOME}/workspace`
        : `${CONTAINER_HOME}/workspace-${agentId}`

    const proc = Bun.spawn(
      [
        podmanPath,
        'exec',
        '-it',
        containerName,
        '/bin/sh',
        '-c',
        `cd ${workspace} 2>/dev/null; exec /bin/sh`,
      ],
      {
        terminal: {
          cols: 80,
          rows: 24,
          data(_terminal, data) {
            try {
              ws.send(data)
            } catch {
              // WebSocket may have closed
            }
          },
        },
        env: { ...process.env, TERM: 'xterm-256color' },
      },
    )

    proc.exited.then(() => {
      if (this.sessions.has(ws)) {
        this.sessions.delete(ws)
        try {
          ws.close()
        } catch {
          // Already closed
        }
      }
    })

    this.sessions.set(ws, { proc })
    logger.debug('Terminal session created', { agentId })
  }

  write(ws: ServerWebSocket<TerminalWsData>, data: string): void {
    const session = this.sessions.get(ws)
    if (!session?.proc.terminal) return
    session.proc.terminal.write(data)
  }

  resize(
    ws: ServerWebSocket<TerminalWsData>,
    cols: number,
    rows: number,
  ): void {
    const session = this.sessions.get(ws)
    if (!session?.proc.terminal) return
    session.proc.terminal.resize(cols, rows)
  }

  destroy(ws: ServerWebSocket<TerminalWsData>): void {
    const session = this.sessions.get(ws)
    if (!session) return
    this.sessions.delete(ws)
    try {
      session.proc.terminal?.close()
      session.proc.kill()
    } catch {
      // Best effort cleanup
    }
    logger.debug('Terminal session destroyed')
  }

  destroyAll(): void {
    for (const [ws] of this.sessions) {
      this.destroy(ws)
    }
  }
}
