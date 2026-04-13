import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { ArrowLeft } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@/components/ui/button'
import { getAgentServerUrl } from '@/lib/browseros/helpers'

interface AgentTerminalProps {
  onBack: () => void
}

type TerminalServerMessage =
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string }

function parseTerminalMessage(data: unknown): TerminalServerMessage | null {
  if (typeof data !== 'string') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'type' in parsed &&
    parsed.type === 'output' &&
    'data' in parsed &&
    typeof parsed.data === 'string'
  ) {
    return { type: 'output', data: parsed.data }
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'type' in parsed &&
    parsed.type === 'error' &&
    'message' in parsed &&
    typeof parsed.message === 'string'
  ) {
    return { type: 'error', message: parsed.message }
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'type' in parsed &&
    parsed.type === 'exit' &&
    'exitCode' in parsed &&
    typeof parsed.exitCode === 'number'
  ) {
    return { type: 'exit', exitCode: parsed.exitCode }
  }
  return null
}

export const AgentTerminal: FC<AgentTerminalProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null)

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
    let sawExit = false

    const sendMessage = (
      message:
        | { type: 'input'; data: string }
        | { type: 'resize'; cols: number; rows: number },
    ): void => {
      if (ws?.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify(message))
    }

    const sendResize = (cols = terminal.cols, rows = terminal.rows): void => {
      sendMessage({ type: 'resize', cols, rows })
    }

    const connect = async () => {
      const baseUrl = await getAgentServerUrl()
      const wsUrl = new URL('/terminal/ws', baseUrl)
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        terminal.focus()
        sendResize()
      }

      ws.onmessage = (event) => {
        const message = parseTerminalMessage(event.data)
        if (!message) return

        if (message.type === 'output') {
          terminal.write(message.data)
        } else if (message.type === 'error') {
          terminal.write(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`)
        } else {
          sawExit = true
          terminal.write(
            `\r\n\x1b[90m[session ended with exit ${message.exitCode}]\x1b[0m\r\n`,
          )
        }
      }

      ws.onclose = () => {
        if (sawExit) return
        terminal.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n')
      }

      ws.onerror = () => {
        terminal.write('\r\n\x1b[31m[connection error]\x1b[0m\r\n')
      }

      terminal.onData((data) => {
        sendMessage({ type: 'input', data })
      })

      terminal.onResize(({ cols, rows }) => {
        sendResize(cols, rows)
      })
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
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b px-4 py-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex flex-col">
          <span className="font-medium text-sm">Container Terminal</span>
          <span className="text-muted-foreground text-xs">
            Starts in <code className="font-mono">/home/node/.openclaw</code>
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1"
        style={{ backgroundColor: '#1e1e1e' }}
      />
    </div>
  )
}
