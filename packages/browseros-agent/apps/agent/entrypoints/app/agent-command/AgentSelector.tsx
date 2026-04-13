import { Check, ChevronDown, Plus } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  type AgentEntry,
  getModelDisplayName,
} from '@/entrypoints/app/agents/useOpenClaw'
import { cn } from '@/lib/utils'

interface AgentSelectorProps {
  agents: AgentEntry[]
  selectedAgentId: string | null
  onSelectAgent: (agent: AgentEntry) => void
  onCreateAgent?: () => void
  status?: string
}

function getStatusDot(status?: string) {
  if (status === 'running') return 'bg-emerald-500'
  if (status === 'starting') return 'bg-amber-500 animate-pulse'
  if (status === 'error') return 'bg-destructive'
  return 'bg-muted-foreground/50'
}

export const AgentSelector: FC<AgentSelectorProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCreateAgent,
  status,
}) => {
  const [open, setOpen] = useState(false)
  const selectedAgent = agents.find((a) => a.agentId === selectedAgentId)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <span className={cn('size-2 rounded-full', getStatusDot(status))} />
          <span className="max-w-[120px] truncate text-sm">
            {selectedAgent?.name ?? 'Select agent'}
          </span>
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-52 p-0">
        <Command>
          <CommandInput placeholder="Search agents..." className="h-9" />
          <CommandList>
            <CommandEmpty>No agents found</CommandEmpty>
            <CommandGroup>
              {agents.map((agent) => {
                const isSelected = selectedAgentId === agent.agentId
                return (
                  <CommandItem
                    key={agent.agentId}
                    value={`${agent.agentId} ${agent.name}`}
                    onSelect={() => {
                      onSelectAgent(agent)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md p-2',
                      isSelected && 'bg-[var(--accent-orange)]/10',
                    )}
                  >
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        getStatusDot(status),
                      )}
                    />
                    <span className="flex-1 truncate text-sm">
                      {agent.name}
                    </span>
                    {getModelDisplayName(agent.model) && (
                      <span className="text-muted-foreground text-xs">
                        {getModelDisplayName(agent.model)}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="size-3.5 text-[var(--accent-orange)]" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {onCreateAgent && (
              <div className="border-border border-t p-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md p-2 text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    onCreateAgent()
                    setOpen(false)
                  }}
                >
                  <Plus className="size-4" />
                  Create Agent
                </button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
