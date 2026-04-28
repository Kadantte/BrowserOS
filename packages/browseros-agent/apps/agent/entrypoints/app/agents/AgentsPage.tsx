import {
  AlertCircle,
  Bot,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  HarnessAdapterDescriptor,
  HarnessAgent,
  HarnessAgentAdapter,
} from './agent-harness-types'
import {
  useAgentAdapters,
  useCreateHarnessAgent,
  useDeleteHarnessAgent,
  useHarnessAgents,
} from './useAgents'

const DEFAULT_ADAPTER: HarnessAgentAdapter = 'claude'

export const AgentsPage: FC = () => {
  const navigate = useNavigate()
  const {
    adapters,
    loading: adaptersLoading,
    error: adaptersError,
  } = useAgentAdapters()
  const {
    harnessAgents,
    loading: agentsLoading,
    error: agentsError,
    refetch,
  } = useHarnessAgents()
  const createAgent = useCreateHarnessAgent()
  const deleteAgent = useDeleteHarnessAgent()
  const [createOpen, setCreateOpen] = useState(false)

  const sortedAgents = useMemo(
    () => [...harnessAgents].sort((a, b) => b.updatedAt - a.updatedAt),
    [harnessAgents],
  )

  const loading = adaptersLoading || agentsLoading
  const error = adaptersError ?? agentsError ?? null

  return (
    <div className="min-h-full bg-background px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <AgentHarnessPageHeader
          loading={loading}
          onCreateAgent={() => setCreateOpen(true)}
          onRefresh={() => void refetch()}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Agent request failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <HarnessAgentList
          agents={sortedAgents}
          deletingAgentId={
            typeof deleteAgent.variables === 'string'
              ? deleteAgent.variables
              : null
          }
          loading={loading}
          onChatAgent={(agentId) => navigate(`/agents/${agentId}`)}
          onCreateAgent={() => setCreateOpen(true)}
          onDeleteAgent={(agentId) => void deleteAgent.mutateAsync(agentId)}
        />

        <NewHarnessAgentDialog
          adapters={adapters}
          creating={createAgent.isPending}
          error={createAgent.error ?? null}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={async (input) => {
            const agent = await createAgent.mutateAsync(input)
            setCreateOpen(false)
            navigate(`/agents/${agent.id}`)
          }}
        />
      </div>
    </div>
  )
}

function AgentHarnessPageHeader({
  loading,
  onCreateAgent,
  onRefresh,
}: {
  loading: boolean
  onCreateAgent: () => void
  onRefresh: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-semibold text-2xl tracking-normal">Agents</h1>
        <p className="text-muted-foreground text-sm">Claude and Codex agents</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
        <Button onClick={onCreateAgent}>
          <Plus className="mr-2 size-4" />
          New Agent
        </Button>
      </div>
    </div>
  )
}

function HarnessAgentList({
  agents,
  deletingAgentId,
  loading,
  onChatAgent,
  onCreateAgent,
  onDeleteAgent,
}: {
  agents: HarnessAgent[]
  deletingAgentId: string | null
  loading: boolean
  onChatAgent: (agentId: string) => void
  onCreateAgent: () => void
  onDeleteAgent: (agentId: string) => void
}) {
  if (loading && agents.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-border/70">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-4 rounded-lg border border-border/70 text-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Bot className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-medium text-base">No agents</h2>
          <p className="text-muted-foreground text-sm">
            Create a Claude or Codex agent.
          </p>
        </div>
        <Button variant="outline" onClick={onCreateAgent}>
          <Plus className="mr-2 size-4" />
          New Agent
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {agents.map((agent) => (
        <Card key={agent.id} className="rounded-lg border-border/70">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-sm">{agent.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <span className="capitalize">{agent.adapter}</span>
                  <span>{agent.modelId ?? 'default'}</span>
                  <Badge variant="outline" className="rounded-md">
                    main
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onChatAgent(agent.id)}>
                <MessageSquare className="mr-2 size-4" />
                Chat
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Delete agent"
                onClick={() => onDeleteAgent(agent.id)}
                disabled={deletingAgentId === agent.id}
              >
                {deletingAgentId === agent.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function NewHarnessAgentDialog({
  adapters,
  creating,
  error,
  open,
  onCreate,
  onOpenChange,
}: {
  adapters: HarnessAdapterDescriptor[]
  creating: boolean
  error: Error | null
  open: boolean
  onCreate: (input: {
    name: string
    adapter: HarnessAgentAdapter
    modelId?: string
    reasoningEffort?: string
  }) => Promise<void>
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [adapterId, setAdapterId] =
    useState<HarnessAgentAdapter>(DEFAULT_ADAPTER)
  const selectedAdapter =
    adapters.find((adapter) => adapter.id === adapterId) ?? adapters[0]
  const [modelId, setModelId] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')

  useEffect(() => {
    if (!open) return
    const adapter =
      adapters.find((entry) => entry.id === adapterId) ?? adapters[0]
    if (!adapter) return
    setModelId((current) => current || adapter.defaultModelId)
    setReasoningEffort((current) => current || adapter.defaultReasoningEffort)
  }, [adapterId, adapters, open])

  const handleAdapterChange = (value: string) => {
    if (value !== 'claude' && value !== 'codex') return
    const adapter = adapters.find((entry) => entry.id === value)
    setAdapterId(value)
    setModelId(adapter?.defaultModelId ?? '')
    setReasoningEffort(adapter?.defaultReasoningEffort ?? '')
  }

  const canCreate =
    Boolean(name.trim()) && Boolean(selectedAdapter) && !creating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Create failed</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Review bot"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-adapter">Adapter</Label>
            <Select value={adapterId} onValueChange={handleAdapterChange}>
              <SelectTrigger id="agent-adapter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adapters.map((adapter) => (
                  <SelectItem key={adapter.id} value={adapter.id}>
                    {adapter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-model">Model</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger id="agent-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(selectedAdapter?.models ?? []).map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-effort">Reasoning</Label>
            <Select value={reasoningEffort} onValueChange={setReasoningEffort}>
              <SelectTrigger id="agent-effort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(selectedAdapter?.reasoningEfforts ?? []).map((effort) => (
                  <SelectItem key={effort.id} value={effort.id}>
                    {effort.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            disabled={!canCreate}
            onClick={() =>
              void onCreate({
                name: name.trim(),
                adapter: adapterId,
                modelId: modelId || undefined,
                reasoningEffort: reasoningEffort || undefined,
              })
            }
          >
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
