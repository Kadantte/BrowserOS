import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { ArrowLeft } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@/components/ui/button'
import { getAgentServerUrl } from '@/lib/browseros/helpers'

interface AgentTerminalProps {
  agentId: string
  agentName: string
  onBack: () => void
}

export const AgentTerminal: FC<AgentTerminalProps> = ({
  agentId,
  agentName,
  onBack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeMessageEncoder = useRef(new TextEncoder())

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(containerRef.current)
    fitAddon.fit()

    let ws: WebSocket | null = null

    const connect = async () => {
      const baseUrl = await getAgentServerUrl()
      const wsUrl = baseUrl
        .replace(/^http/, 'ws')
        .concat(`/terminal/ws?agentId=${encodeURIComponent(agentId)}`)

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        terminal.focus()
        sendResize()
      }

      ws.onmessage = (event) => {
        terminal.write(event.data)
      }

      ws.onclose = () => {
        terminal.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n')
      }

      ws.onerror = () => {
        terminal.write('\r\n\x1b[31m[connection error]\x1b[0m\r\n')
      }

      terminal.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })

      terminal.onResize(({ cols, rows }) => {
        if (ws?.readyState === WebSocket.OPEN) {
          sendResize(cols, rows)
        }
      })
    }

    const sendResize = (cols = terminal.cols, rows = terminal.rows): void => {
      if (ws?.readyState !== WebSocket.OPEN) return
      const msg = JSON.stringify({ type: 'resize', cols, rows })
      ws.send(resizeMessageEncoder.current.encode(msg))
    }

    connect()

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      sendResize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      ws?.close()
      terminal.dispose()
    }
  }, [agentId])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-medium text-sm">Terminal — {agentName}</span>
      </div>
      <div
        ref={containerRef}
        className="flex-1"
        style={{ backgroundColor: '#1e1e1e' }}
      />
    </div>
  )
}
