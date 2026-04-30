import {
  Copy,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  canDelete as canDeleteAgent,
  canRename as canRenameAgent,
  displayName,
} from '../agent-display.helpers'
import type { AgentListItem } from '../agents-page-types'

interface AgentActionsProps {
  agent: AgentListItem
  activeTurnId: string | null
  deleting?: boolean
  onDelete: (agent: AgentListItem) => void
}

export const AgentActions: FC<AgentActionsProps> = ({
  agent,
  activeTurnId,
  deleting,
  onDelete,
}) => {
  const navigate = useNavigate()
  const allowDelete = canDeleteAgent(agent)
  const allowRename = canRenameAgent(agent)

  const handleChat = () => navigate(`/agents/${agent.agentId}`)
  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(agent.agentId)
      toast.success('Agent id copied')
    } catch {
      toast.error('Could not copy agent id')
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {activeTurnId && (
        <Button
          variant="default"
          size="sm"
          onClick={handleChat}
          className="bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90"
        >
          <Play className="mr-1.5 size-3 fill-current" />
          Resume
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={handleChat}>
        <MessageSquare className="mr-1.5 size-3" />
        Chat
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${displayName(agent)}`}
            className="size-8"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => void handleCopyId()}>
            <Copy className="mr-2 size-3.5" />
            Copy id
          </DropdownMenuItem>
          {/*
            Rename and Reset history land in their own follow-ups; the
            placeholders here keep the menu shape stable and signal
            that the slots belong to this dropdown.
          */}
          <ComingSoonItem
            icon={Pencil}
            label="Rename"
            disabled={!allowRename}
          />
          <ComingSoonItem icon={RotateCcw} label="Reset history" disabled />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onDelete(agent)}
            disabled={!allowDelete || deleting}
            className="text-destructive focus:text-destructive"
          >
            {deleting ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-3.5" />
            )}
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

interface ComingSoonItemProps {
  icon: typeof Pencil
  label: string
  disabled: boolean
}

const ComingSoonItem: FC<ComingSoonItemProps> = ({
  icon: Icon,
  label,
  disabled,
}) => {
  const item = (
    <DropdownMenuItem disabled className="text-muted-foreground">
      <Icon className="mr-2 size-3.5" />
      {label}
    </DropdownMenuItem>
  )
  if (!disabled) return item
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block w-full">{item}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {label} coming soon
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
