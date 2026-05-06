import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import type { Control } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  type AcpAgentDetection,
  refetchAcpAgentsFresh,
  useAcpAgentDetection,
} from './useAcpAgentDetection'

/**
 * Subset of the parent form's value shape this component cares about.
 * Mirrors the fields added to providerFormSchema for ACP.
 */
export interface AcpFormValues {
  acpAgentId?: string
  acpDefaultCwd?: string
  acpPermissionMode?: 'approve-all' | 'approve-reads' | 'deny-all'
}

interface AcpProviderFormProps {
  // biome-ignore lint/suspicious/noExplicitAny: react-hook-form's Control needs the parent's value shape, but exporting it here would create a circular import.
  control: Control<any>
  agentServerUrl: string | null | undefined
  /** Called when the user picks an agent from the list. */
  onAgentSelected: (agentId: string, displayName: string) => void
}

/**
 * ACP-specific provider configuration form. Composed inside
 * NewProviderDialog when `type === 'acp'` is selected.
 */
export const AcpProviderForm: FC<AcpProviderFormProps> = ({
  control,
  agentServerUrl,
  onAgentSelected,
}) => {
  const detection = useAcpAgentDetection(agentServerUrl, true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshedAgents, setRefreshedAgents] = useState<
    AcpAgentDetection[] | null
  >(null)
  const agents = refreshedAgents ?? detection.data ?? []

  const handleRefresh = async () => {
    if (!agentServerUrl) return
    setIsRefreshing(true)
    try {
      const fresh = await refetchAcpAgentsFresh(agentServerUrl)
      setRefreshedAgents(fresh)
    } catch {
      // Surface via the existing error state — react-query will retry
      // on next query invocation.
    } finally {
      setIsRefreshing(false)
    }
  }

  const installed = agents.filter((a) => a.installState === 'installed')
  const npxAvailable = agents.filter((a) => a.installState === 'npx-available')
  const notInstalled = agents.filter((a) => a.installState === 'not-installed')
  const hasAnyAvailable = installed.length > 0 || npxAvailable.length > 0

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="font-medium text-sm">Pick an installed ACP agent</h4>
          <p className="text-muted-foreground text-xs">
            Bridges any locally installed coding agent (Claude Code, Codex,
            Gemini, …) into BrowserOS chat. Tools come from the BrowserOS MCP
            server — the agent operates the browser natively.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={!agentServerUrl || isRefreshing || detection.isLoading}
        >
          {isRefreshing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Refresh
        </Button>
      </div>

      <FormField
        control={control}
        name="acpAgentId"
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormControl>
              <div className="space-y-3">
                {detection.isLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Detecting installed agents…
                  </div>
                )}

                {detection.isError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">Detection failed</div>
                      <div className="text-xs opacity-80">
                        {detection.error.message}
                      </div>
                    </div>
                  </div>
                )}

                {!detection.isLoading &&
                  !detection.isError &&
                  !hasAnyAvailable && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      No installed ACP agents found on this machine. Install one
                      of the agents below, then click Refresh.
                    </div>
                  )}

                {installed.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Installed
                    </div>
                    <div className="space-y-1.5">
                      {installed.map((agent) => (
                        <AgentRow
                          key={agent.agentId}
                          agent={agent}
                          selected={field.value === agent.agentId}
                          onSelect={() => {
                            field.onChange(agent.agentId)
                            onAgentSelected(agent.agentId, agent.displayName)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {npxAvailable.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Auto-installs via npx
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Not yet on disk. First chat will fetch the package (~10–30
                      s).
                    </p>
                    <div className="space-y-1.5">
                      {npxAvailable.map((agent) => (
                        <AgentRow
                          key={agent.agentId}
                          agent={agent}
                          selected={field.value === agent.agentId}
                          onSelect={() => {
                            field.onChange(agent.agentId)
                            onAgentSelected(agent.agentId, agent.displayName)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {notInstalled.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Not installed on this machine
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {notInstalled.map((agent) => (
                        <a
                          key={agent.agentId}
                          href={agent.installUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-muted-foreground text-xs hover:bg-muted"
                        >
                          {agent.displayName}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="acpDefaultCwd"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Default workspace (optional)</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. /Users/me/code"
                {...field}
                value={field.value ?? ''}
              />
            </FormControl>
            <FormDescription>
              Used when no workspace is selected in chat. If left empty,
              BrowserOS auto-creates a per-conversation scratch directory.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="acpPermissionMode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Permission mode</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value ?? 'approve-reads'}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="approve-reads">
                  approve-reads — auto-approve read-only tools
                </SelectItem>
                <SelectItem value="approve-all">
                  approve-all — auto-approve every tool (less safe)
                </SelectItem>
                <SelectItem value="deny-all">
                  deny-all — no tools run automatically
                </SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              ACP agents use a single up-front policy — there is no per-call
              permission prompt yet.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

interface AgentRowProps {
  agent: AcpAgentDetection
  selected: boolean
  onSelect: () => void
}

const AgentRow: FC<AgentRowProps> = ({ agent, selected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2',
          selected
            ? 'border-primary bg-primary ring-2 ring-primary/20'
            : 'border-muted-foreground/40',
        )}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{agent.displayName}</span>
          {agent.version && (
            <span className="rounded-sm bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
              v{agent.version}
            </span>
          )}
          {agent.npxBased && (
            <span className="rounded-sm bg-muted px-1 py-px text-[10px] text-muted-foreground">
              npx
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
