import { type FC, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getAgentServerUrl } from '@/lib/browseros/helpers'

interface AgentLogsDialogProps {
  agentId: string
  agentName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AgentLogsDialog: FC<AgentLogsDialogProps> = ({
  agentId,
  agentName,
  open,
  onOpenChange,
}) => {
  const [logs, setLogs] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  useEffect(() => {
    if (!open) return

    let eventSource: EventSource | null = null

    const connect = async () => {
      try {
        const baseUrl = await getAgentServerUrl()
        eventSource = new EventSource(`${baseUrl}/agents/${agentId}/logs`)

        eventSource.onmessage = (event) => {
          const line = JSON.parse(event.data) as string
          setLogs((prev) => [...prev, line])
        }
      } catch {
        // Connection failed
      }
    }

    setLogs([])
    connect()

    return () => {
      eventSource?.close()
    }
  }, [open, agentId])

  // Auto-scroll to bottom when new logs arrive
  const logsLength = logs.length
  // biome-ignore lint/correctness/useExhaustiveDependencies: logsLength triggers scroll on new log lines
  useEffect(() => {
    if (isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logsLength])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Logs: {agentName}</DialogTitle>
        </DialogHeader>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[400px] overflow-y-auto rounded-md border bg-black p-4"
        >
          <pre className="whitespace-pre-wrap font-mono text-green-400 text-xs">
            {logs.length === 0 ? 'Waiting for logs...' : logs.join('\n')}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}
