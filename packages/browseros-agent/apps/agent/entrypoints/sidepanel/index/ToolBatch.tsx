import {
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  Loader2,
  ShieldCheck,
  ShieldX,
  XCircle,
} from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type {
  ToolInvocationInfo,
  ToolInvocationState,
} from './getMessageSegments'

interface ToolBatchProps {
  tools: ToolInvocationInfo[]
  isLastBatch: boolean
  isLastMessage: boolean
  isStreaming: boolean
  onApprove?: (approvalId: string) => void
  onDeny?: (approvalId: string) => void
}

export const ToolBatch: FC<ToolBatchProps> = ({
  tools,
  isLastBatch,
  isLastMessage,
  isStreaming,
  onApprove,
  onDeny,
}) => {
  const hasPendingApproval = tools.some((t) => t.state === 'approval-requested')
  const shouldBeOpen =
    (isLastMessage && isLastBatch && isStreaming) || hasPendingApproval
  const [isOpen, setIsOpen] = useState(shouldBeOpen)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)

  useEffect(() => {
    if (hasPendingApproval) {
      setIsOpen(true)
      return
    }
    if (isLastMessage && !hasUserInteracted) {
      if (isLastBatch) {
        setIsOpen(isStreaming)
      } else {
        setIsOpen(false)
      }
    }
  }, [
    isStreaming,
    isLastMessage,
    isLastBatch,
    hasUserInteracted,
    hasPendingApproval,
  ])

  const completedCount = tools.filter((t) => isToolCompleted(t.state)).length
  const allDone = completedCount === tools.length && !hasPendingApproval
  const headerLabel = hasPendingApproval
    ? 'Waiting for approval'
    : `${tools.length} tool ${tools.length === 1 ? 'call' : 'calls'}${allDone ? '' : ` · ${completedCount}/${tools.length}`}`

  const onManualToggle = (newState: boolean) => {
    setHasUserInteracted(true)
    setIsOpen(newState)
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onManualToggle}
      className="my-3 rounded-[10px] border border-border bg-background px-3 py-2.5"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 text-left"
        >
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.4px]">
            {headerLabel}
          </span>
          <div className="flex-1" />
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'mt-2 grid gap-0.5',
          'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
        )}
      >
        {tools.map((tool) => (
          <div key={tool.toolCallId}>
            <div className="flex items-center gap-2.5 py-1 font-mono text-xs">
              <ToolStatusIcon state={tool.state} />
              <span className="font-medium">
                {formatToolName(tool.toolName)}
              </span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                {formatInputPreview(tool.input)}
              </span>
            </div>
            {tool.state === 'approval-requested' &&
              tool.approval?.id != null && (
                <ApprovalButtons
                  approvalId={tool.approval.id}
                  onApprove={onApprove}
                  onDeny={onDeny}
                />
              )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

const formatToolName = (name: string) => {
  return name
    ?.replace(/_/g, ' ')
    ?.replace(/([a-z])([A-Z])/g, '$1 $2')
    ?.replace(/^./, (s) => s.toUpperCase())
}

const formatInputPreview = (input: Record<string, unknown> | undefined) => {
  if (!input) return ''
  const firstValue = Object.values(input).find(
    (v) => typeof v === 'string' && v.length > 0,
  )
  if (typeof firstValue === 'string') return firstValue
  return ''
}

const isToolCompleted = (state: ToolInvocationState) =>
  state === 'result' || state === 'output-available'

const isToolInProgress = (state: ToolInvocationState) =>
  state === 'call' || state === 'input-available'

const isToolError = (state: ToolInvocationState) => state === 'output-error'

const isToolDenied = (state: ToolInvocationState) => state === 'output-denied'

const isToolApprovalPending = (state: ToolInvocationState) =>
  state === 'approval-requested'

const ApprovalButtons: FC<{
  approvalId: string
  onApprove?: (id: string) => void
  onDeny?: (id: string) => void
}> = ({ approvalId, onApprove, onDeny }) => (
  <div className="mt-1 mb-1.5 ml-5 flex items-center gap-2">
    <Button
      size="sm"
      className="h-7 gap-1 px-2.5 text-xs"
      onClick={() => onApprove?.(approvalId)}
    >
      <ShieldCheck className="size-3" />
      Approve
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2.5 text-xs"
      onClick={() => onDeny?.(approvalId)}
    >
      <ShieldX className="size-3" />
      Deny
    </Button>
  </div>
)

const ToolStatusIcon: FC<{ state: ToolInvocationState }> = ({ state }) => {
  if (isToolCompleted(state)) {
    return (
      <Check
        className="h-3 w-3 text-[var(--accent-orange)]"
        strokeWidth={2.5}
      />
    )
  }
  if (isToolApprovalPending(state)) {
    return <Clock className="h-3 w-3 text-yellow-500" />
  }
  if (isToolDenied(state)) {
    return <ShieldX className="h-3 w-3 text-red-400" />
  }
  if (isToolInProgress(state)) {
    return (
      <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-orange)]" />
    )
  }
  if (isToolError(state)) {
    return <XCircle className="h-3 w-3 text-destructive" />
  }
  return <CircleDashed className="h-3 w-3 text-muted-foreground" />
}
