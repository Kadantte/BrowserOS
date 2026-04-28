import {
  AlertCircle,
  Bot,
  Cpu,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldAlert,
  Square,
  TerminalSquare,
  Trash2,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { useLlmProviders } from '@/lib/llm-providers/useLlmProviders'
import { AgentTerminal } from './AgentTerminal'
import type {
  HarnessAdapterDescriptor,
  HarnessAgent,
  HarnessAgentAdapter,
} from './agent-harness-types'
import {
  buildOpenClawCliProviderOptions,
  findOpenClawCliProviderById,
  type OpenClawCliProvider,
  type OpenClawCliProviderAuthStatus,
  OpenClawCliProviderStatusPanel,
  useOpenClawCliProviderAuthStatus,
} from './openclaw-cli-providers'
import { getOpenClawSupportedProviders } from './openclaw-supported-providers'
import {
  useAgentAdapters,
  useCreateHarnessAgent,
  useDeleteHarnessAgent,
  useHarnessAgents,
} from './useAgents'
import {
  type AgentEntry,
  type GatewayLifecycleAction,
  getModelDisplayName,
  type OpenClawStatus,
  useOpenClawAgents,
  useOpenClawMutations,
  useOpenClawStatus,
} from './useOpenClaw'

type CreateAgentRuntime = 'openclaw' | HarnessAgentAdapter

interface ProviderOption {
  id: string
  type: string
  name: string
  modelId: string
  baseUrl?: string
  apiKey?: string
}

interface AgentListItem {
  key: string
  agentId: string
  name: string
  source: 'openclaw' | 'agent-harness'
  runtimeLabel: string
  modelLabel: string
  detail: string
  canChat: boolean
  canDelete: boolean
}

interface GatewayUiState {
  canManageAgents: boolean
  controlPlaneDegraded: boolean
  controlPlaneBusy: boolean
}

const DEFAULT_HARNESS_ADAPTER: HarnessAgentAdapter = 'claude'
const DEFAULT_CREATE_RUNTIME: CreateAgentRuntime = 'openclaw'

const LIFECYCLE_BANNER_COPY: Record<GatewayLifecycleAction, string> = {
  setup: 'Setting up OpenClaw...',
  start: 'Starting gateway...',
  stop: 'Stopping gateway...',
  restart: 'Restarting gateway...',
  reconnect: 'Restoring gateway connection...',
}

const CONTROL_PLANE_COPY: Record<
  OpenClawStatus['controlPlaneStatus'],
  {
    badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive'
    badgeLabel: string
    title: string
    description: string
  }
> = {
  connected: {
    badgeVariant: 'default',
    badgeLabel: 'Control Plane Ready',
    title: 'Gateway Connected',
    description: 'OpenClaw can create, manage, and chat with agents normally.',
  },
  connecting: {
    badgeVariant: 'secondary',
    badgeLabel: 'Connecting',
    title: 'Connecting to Gateway',
    description:
      'BrowserOS is establishing the OpenClaw control channel for agent operations.',
  },
  reconnecting: {
    badgeVariant: 'secondary',
    badgeLabel: 'Reconnecting',
    title: 'Reconnecting Control Plane',
    description:
      'The gateway process is up, but BrowserOS is restoring the control channel.',
  },
  recovering: {
    badgeVariant: 'secondary',
    badgeLabel: 'Recovering',
    title: 'Recovering Gateway Connection',
    description:
      'BrowserOS detected a control-plane fault and is trying a safe recovery path.',
  },
  disconnected: {
    badgeVariant: 'outline',
    badgeLabel: 'Disconnected',
    title: 'Gateway Disconnected',
    description: 'The gateway process is not available to BrowserOS right now.',
  },
  failed: {
    badgeVariant: 'destructive',
    badgeLabel: 'Needs Attention',
    title: 'Gateway Recovery Failed',
    description:
      'BrowserOS could not restore the OpenClaw control channel automatically.',
  },
}

const FALLBACK_CONTROL_PLANE_COPY = {
  badgeVariant: 'outline' as const,
  badgeLabel: 'Unknown',
  title: 'Gateway State Unknown',
  description:
    'BrowserOS received a gateway status it does not recognize yet. Refreshing or reconnecting should restore a known state.',
}

const RECOVERY_REASON_COPY: Record<
  NonNullable<OpenClawStatus['lastRecoveryReason']>,
  string
> = {
  transient_disconnect:
    'The control channel dropped briefly and BrowserOS is retrying it.',
  signature_expired:
    'The gateway rejected the signed device handshake because its clock drifted.',
  pairing_required:
    'The gateway asked BrowserOS to approve its local device identity again.',
  token_mismatch:
    'BrowserOS had to reload the gateway token before reconnecting.',
  container_not_ready:
    'The OpenClaw gateway process is not ready yet, so control-plane recovery cannot start.',
  unknown:
    'BrowserOS hit an unexpected gateway error and could not classify it cleanly.',
}

const StatusBadge: FC<{ status: OpenClawStatus['status'] }> = ({ status }) => {
  const variants: Record<
    OpenClawStatus['status'],
    {
      variant: 'default' | 'secondary' | 'outline' | 'destructive'
      label: string
    }
  > = {
    running: { variant: 'default', label: 'Running' },
    starting: { variant: 'secondary', label: 'Starting...' },
    stopped: { variant: 'outline', label: 'Stopped' },
    error: { variant: 'destructive', label: 'Error' },
    uninitialized: { variant: 'outline', label: 'Not Set Up' },
  }
  const current = variants[status] ?? {
    variant: 'outline' as const,
    label: 'Unknown',
  }
  return <Badge variant={current.variant}>{current.label}</Badge>
}

const ControlPlaneBadge: FC<{
  status: OpenClawStatus['controlPlaneStatus']
}> = ({ status }) => {
  const current = CONTROL_PLANE_COPY[status] ?? FALLBACK_CONTROL_PLANE_COPY
  return <Badge variant={current.badgeVariant}>{current.badgeLabel}</Badge>
}

function getControlPlaneCopy(status: OpenClawStatus['controlPlaneStatus']) {
  return CONTROL_PLANE_COPY[status] ?? FALLBACK_CONTROL_PLANE_COPY
}

function getRecoveryDetail(status: OpenClawStatus): string | null {
  if (!status.lastRecoveryReason && !status.lastGatewayError) return null

  const detail = status.lastRecoveryReason
    ? RECOVERY_REASON_COPY[status.lastRecoveryReason]
    : null

  if (status.lastGatewayError && detail) {
    return `${detail} Latest gateway error: ${status.lastGatewayError}`
  }

  return status.lastGatewayError ?? detail
}

function formatHarnessAdapter(adapter: HarnessAgentAdapter): string {
  return adapter === 'claude' ? 'Claude Code' : 'Codex'
}

function toProviderOptions(
  providers: LlmProviderConfig[],
  cliProviders: ProviderOption[],
): ProviderOption[] {
  return [...getOpenClawSupportedProviders(providers), ...cliProviders]
}

function toOpenClawListItem(
  agent: AgentEntry,
  canManageAgents: boolean,
): AgentListItem {
  return {
    key: `openclaw:${agent.agentId}`,
    agentId: agent.agentId,
    name: agent.name,
    source: 'openclaw',
    runtimeLabel: 'OpenClaw',
    modelLabel: getModelDisplayName(agent.model) ?? 'default',
    detail: agent.workspace,
    canChat: canManageAgents,
    canDelete: canManageAgents && agent.agentId !== 'main',
  }
}

function toHarnessListItem(agent: HarnessAgent): AgentListItem {
  return {
    key: `agent-harness:${agent.id}`,
    agentId: agent.id,
    name: agent.name,
    source: 'agent-harness',
    runtimeLabel: formatHarnessAdapter(agent.adapter),
    modelLabel: agent.modelId ?? 'default',
    detail: `${agent.adapter}:main`,
    canChat: true,
    canDelete: true,
  }
}

function getGatewayUiState(status: OpenClawStatus | null): GatewayUiState {
  if (!status) {
    return {
      canManageAgents: false,
      controlPlaneDegraded: false,
      controlPlaneBusy: false,
    }
  }

  const controlPlaneBusy =
    status.controlPlaneStatus === 'connecting' ||
    status.controlPlaneStatus === 'reconnecting' ||
    status.controlPlaneStatus === 'recovering'

  return {
    canManageAgents:
      status.status === 'running' && status.controlPlaneStatus === 'connected',
    controlPlaneBusy,
    controlPlaneDegraded:
      status.status === 'running' && status.controlPlaneStatus !== 'connected',
  }
}

function getLifecycleBanner(
  action: GatewayLifecycleAction | null,
): string | null {
  return action ? LIFECYCLE_BANNER_COPY[action] : null
}

function canManageOpenClawAgents(
  state: GatewayUiState,
  lifecyclePending: boolean,
): boolean {
  return state.canManageAgents && !lifecyclePending
}

function shouldShowControlPlaneDegraded(
  state: GatewayUiState,
  lifecyclePending: boolean,
): boolean {
  return state.controlPlaneDegraded && !lifecyclePending
}

function getControlPlaneCopyForStatus(status: OpenClawStatus | null) {
  return status
    ? getControlPlaneCopy(status.controlPlaneStatus)
    : FALLBACK_CONTROL_PLANE_COPY
}

function getVisibleOpenClawAgents(
  enabled: boolean,
  agents: AgentEntry[],
): AgentEntry[] {
  return enabled ? agents : []
}

function getAgentsLoading(input: {
  statusLoading: boolean
  adaptersLoading: boolean
  harnessAgentsLoading: boolean
  openClawAgentsEnabled: boolean
  openClawAgentsLoading: boolean
}): boolean {
  return (
    input.statusLoading ||
    input.adaptersLoading ||
    input.harnessAgentsLoading ||
    (input.openClawAgentsEnabled && input.openClawAgentsLoading)
  )
}

function getInlineError(input: {
  lifecyclePending: boolean
  pageError: string | null
  statusError: Error | null
  openClawAgentsError: Error | null
  adaptersError: Error | null
  harnessAgentsError: Error | null
}): string | null {
  if (input.lifecyclePending) return null
  return (
    input.pageError ??
    input.statusError?.message ??
    input.openClawAgentsError?.message ??
    input.adaptersError?.message ??
    input.harnessAgentsError?.message ??
    null
  )
}

interface ProviderSelectorProps {
  providers: ProviderOption[]
  defaultProviderId: string
  selectedId: string
  onSelect: (id: string) => void
  hideApiKeyHint?: boolean
}

const ProviderSelector: FC<ProviderSelectorProps> = ({
  providers,
  defaultProviderId,
  selectedId,
  onSelect,
  hideApiKeyHint,
}) => {
  if (providers.length === 0) {
    return (
      <div className="space-y-2">
        <p className="font-medium text-sm">LLM Provider</p>
        <p className="text-muted-foreground text-sm">
          No compatible LLM providers configured.{' '}
          <a href="#/settings/ai" className="underline">
            Add one in AI settings
          </a>{' '}
          first.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="provider-select">LLM Provider</Label>
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger id="provider-select">
          <SelectValue placeholder="Select a provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              {provider.name} - {provider.modelId}
              {provider.id === defaultProviderId ? ' (default)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hideApiKeyHint && (
        <p className="text-muted-foreground text-xs">
          Uses your existing API key from BrowserOS settings. The key is passed
          to the container and never leaves your machine.
        </p>
      )}
    </div>
  )
}

interface AgentsPageHeaderProps {
  actionInProgress: boolean
  controlPlaneBusy: boolean
  reconnecting: boolean
  status: OpenClawStatus | null
  onCreateAgent: () => void
  onOpenTerminal: () => void
  onReconnect: () => void
  onRefresh: () => void
  onRestart: () => void
  onStop: () => void
}

const AgentsPageHeader: FC<AgentsPageHeaderProps> = ({
  actionInProgress,
  controlPlaneBusy,
  reconnecting,
  status,
  onCreateAgent,
  onOpenTerminal,
  onReconnect,
  onRefresh,
  onRestart,
  onStop,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 className="font-semibold text-2xl tracking-normal">Agents</h1>
      <p className="text-muted-foreground text-sm">
        OpenClaw, Claude Code, and Codex agents
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {status ? (
        <>
          <StatusBadge status={status.status} />
          {status.status !== 'uninitialized' && (
            <ControlPlaneBadge status={status.controlPlaneStatus} />
          )}
        </>
      ) : null}

      {status?.status === 'running' &&
      status.controlPlaneStatus !== 'connected' ? (
        <Button
          variant="outline"
          onClick={onReconnect}
          disabled={actionInProgress || controlPlaneBusy}
        >
          {reconnecting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Retry Connection
        </Button>
      ) : null}

      {status?.status === 'running' ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRestart}
            disabled={actionInProgress}
            title="Restart gateway"
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            disabled={actionInProgress}
            title="Stop gateway"
          >
            <Square className="size-4" />
          </Button>
          <Button variant="outline" onClick={onOpenTerminal}>
            <TerminalSquare className="mr-2 size-4" />
            Terminal
          </Button>
        </>
      ) : null}

      <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
        <RefreshCw className="size-4" />
      </Button>
      <Button onClick={onCreateAgent}>
        <Plus className="mr-2 size-4" />
        New Agent
      </Button>
    </div>
  </div>
)

function LifecycleAlert({ message }: { message: string }) {
  return (
    <Alert>
      <Loader2 className="size-4 animate-spin" />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  )
}

function InlineErrorAlert({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>Agent action failed</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

interface ControlPlaneAlertProps {
  actionInProgress: boolean
  controlPlaneBusy: boolean
  controlPlaneCopy: ReturnType<typeof getControlPlaneCopy>
  reconnecting: boolean
  recoveryDetail: string | null
  status: OpenClawStatus
  onReconnect: () => void
  onRestart: () => void
}

const ControlPlaneAlert: FC<ControlPlaneAlertProps> = ({
  actionInProgress,
  controlPlaneBusy,
  controlPlaneCopy,
  reconnecting,
  recoveryDetail,
  status,
  onReconnect,
  onRestart,
}) => (
  <Alert
    variant={status.controlPlaneStatus === 'failed' ? 'destructive' : 'default'}
  >
    {status.controlPlaneStatus === 'failed' ? (
      <ShieldAlert className="size-4" />
    ) : status.controlPlaneStatus === 'recovering' ? (
      <Wrench className="size-4" />
    ) : (
      <WifiOff className="size-4" />
    )}
    <AlertTitle>{controlPlaneCopy.title}</AlertTitle>
    <AlertDescription>
      <p>{controlPlaneCopy.description}</p>
      {recoveryDetail ? <p>{recoveryDetail}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReconnect}
          disabled={actionInProgress || controlPlaneBusy}
        >
          {reconnecting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Retry Connection
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRestart}
          disabled={actionInProgress}
        >
          Restart Gateway
        </Button>
      </div>
    </AlertDescription>
  </Alert>
)

interface GatewayStateCardsProps {
  actionInProgress: boolean
  status: OpenClawStatus | null
  onOpenSetup: () => void
  onRestart: () => void
  onStart: () => void
}

const GatewayStateCards: FC<GatewayStateCardsProps> = ({
  actionInProgress,
  status,
  onOpenSetup,
  onRestart,
  onStart,
}) => (
  <>
    {status?.status === 'uninitialized' ? (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Cpu className="size-12 text-muted-foreground" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Set Up OpenClaw</h3>
            <p className="text-muted-foreground text-sm">
              {status.podmanAvailable
                ? 'Create a local BrowserOS VM to run autonomous agents with full tool access.'
                : 'BrowserOS VM runtime is unavailable on this system.'}
            </p>
          </div>
          {status.podmanAvailable ? (
            <Button onClick={onOpenSetup}>Set Up Now</Button>
          ) : null}
        </CardContent>
      </Card>
    ) : null}

    {status?.status === 'stopped' ? (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Cpu className="size-12 text-muted-foreground" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Gateway Stopped</h3>
            <p className="text-muted-foreground text-sm">
              The OpenClaw gateway is not running.
            </p>
          </div>
          <Button onClick={onStart} disabled={actionInProgress}>
            Start Gateway
          </Button>
        </CardContent>
      </Card>
    ) : null}

    {status?.status === 'error' ? (
      <Card className="border-destructive">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <AlertCircle className="size-12 text-destructive" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Gateway Error</h3>
            <p className="text-muted-foreground text-sm">
              {status.error ?? status.lastGatewayError}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={onStart} disabled={actionInProgress}>
              Start Gateway
            </Button>
            <Button
              variant="outline"
              onClick={onRestart}
              disabled={actionInProgress}
            >
              Restart Gateway
            </Button>
          </div>
        </CardContent>
      </Card>
    ) : null}
  </>
)

interface AgentListProps {
  agents: AgentListItem[]
  loading: boolean
  deletingAgentKey: string | null
  onChatAgent: (agent: AgentListItem) => void
  onCreateAgent: () => void
  onDeleteAgent: (agent: AgentListItem) => void
}

const AgentList: FC<AgentListProps> = ({
  agents,
  loading,
  deletingAgentKey,
  onChatAgent,
  onCreateAgent,
  onDeleteAgent,
}) => {
  if (loading && agents.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-border/70">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-48 flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Bot className="size-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-medium text-base">No agents</h2>
            <p className="text-muted-foreground text-sm">
              Create an OpenClaw, Claude Code, or Codex agent.
            </p>
          </div>
          <Button variant="outline" onClick={onCreateAgent}>
            <Plus className="mr-2 size-4" />
            New Agent
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3">
      {agents.map((agent) => (
        <Card key={agent.key} className="rounded-lg border-border/70">
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {agent.source === 'openclaw' ? (
                  <Cpu className="size-5" />
                ) : (
                  <Bot className="size-5" />
                )}
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {agent.name}
                </CardTitle>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <Badge variant="outline" className="rounded-md">
                    {agent.runtimeLabel}
                  </Badge>
                  <span>{agent.modelLabel}</span>
                  <Badge variant="outline" className="rounded-md">
                    main
                  </Badge>
                </div>
                <p className="mt-1 truncate font-mono text-muted-foreground text-xs">
                  {agent.detail}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChatAgent(agent)}
                disabled={!agent.canChat}
              >
                <MessageSquare className="mr-1 size-4" />
                Chat
              </Button>
              {agent.canDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete agent"
                  onClick={() => onDeleteAgent(agent)}
                  disabled={deletingAgentKey === agent.key}
                >
                  {deletingAgentKey === agent.key ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-destructive" />
                  )}
                </Button>
              ) : null}
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

interface NewAgentDialogProps {
  adapters: HarnessAdapterDescriptor[]
  canManageOpenClaw: boolean
  createError: string | null
  createRuntime: CreateAgentRuntime
  creating: boolean
  defaultProviderId: string
  harnessAdapterId: HarnessAgentAdapter
  harnessModelId: string
  harnessReasoningEffort: string
  name: string
  open: boolean
  providers: ProviderOption[]
  selectedCliProvider: OpenClawCliProvider | undefined
  selectedProviderId: string
  cliAuthError: Error | null
  cliAuthLoading: boolean
  cliAuthStatus: OpenClawCliProviderAuthStatus | undefined
  onConnectCliProvider: () => void
  onCreate: () => void
  onOpenChange: (open: boolean) => void
  onRuntimeChange: (runtime: CreateAgentRuntime) => void
  onHarnessAdapterChange: (adapter: HarnessAgentAdapter) => void
  onHarnessModelChange: (modelId: string) => void
  onHarnessReasoningChange: (reasoningEffort: string) => void
  onNameChange: (name: string) => void
  onProviderChange: (providerId: string) => void
}

const NewAgentDialog: FC<NewAgentDialogProps> = ({
  adapters,
  canManageOpenClaw,
  createError,
  createRuntime,
  creating,
  defaultProviderId,
  harnessAdapterId,
  harnessModelId,
  harnessReasoningEffort,
  name,
  open,
  providers,
  selectedCliProvider,
  selectedProviderId,
  cliAuthError,
  cliAuthLoading,
  cliAuthStatus,
  onConnectCliProvider,
  onCreate,
  onOpenChange,
  onRuntimeChange,
  onHarnessAdapterChange,
  onHarnessModelChange,
  onHarnessReasoningChange,
  onNameChange,
  onProviderChange,
}) => {
  const selectedHarnessAdapter =
    adapters.find((adapter) => adapter.id === harnessAdapterId) ?? adapters[0]
  const isHarnessRuntime = createRuntime !== 'openclaw'
  const openClawBlocked = createRuntime === 'openclaw' && !canManageOpenClaw
  const cliBlocked =
    createRuntime === 'openclaw' &&
    !!selectedCliProvider &&
    !cliAuthStatus?.loggedIn
  const canCreate =
    Boolean(name.trim()) &&
    !creating &&
    !openClawBlocked &&
    !cliBlocked &&
    (createRuntime === 'openclaw'
      ? providers.length > 0
      : Boolean(selectedHarnessAdapter))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {createError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Create failed</AlertTitle>
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={
                createRuntime === 'openclaw' ? 'research-agent' : 'Review bot'
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canCreate) onCreate()
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-runtime">Adapter</Label>
            <Select
              value={createRuntime}
              onValueChange={(value) => {
                if (
                  value === 'openclaw' ||
                  value === 'claude' ||
                  value === 'codex'
                ) {
                  onRuntimeChange(value)
                  if (value !== 'openclaw') onHarnessAdapterChange(value)
                }
              }}
            >
              <SelectTrigger id="agent-runtime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openclaw">OpenClaw</SelectItem>
                {adapters.map((adapter) => (
                  <SelectItem key={adapter.id} value={adapter.id}>
                    {adapter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {createRuntime === 'openclaw' ? (
            <>
              {openClawBlocked ? (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertTitle>OpenClaw is not ready</AlertTitle>
                  <AlertDescription>
                    Start or set up the OpenClaw gateway before creating an
                    OpenClaw agent.
                  </AlertDescription>
                </Alert>
              ) : null}

              <ProviderSelector
                providers={providers}
                defaultProviderId={defaultProviderId}
                selectedId={selectedProviderId}
                onSelect={onProviderChange}
                hideApiKeyHint={!!selectedCliProvider}
              />

              {selectedCliProvider ? (
                <OpenClawCliProviderStatusPanel
                  provider={selectedCliProvider}
                  status={cliAuthStatus}
                  loading={cliAuthLoading}
                  fetchError={cliAuthError}
                  onConnect={onConnectCliProvider}
                />
              ) : null}
            </>
          ) : null}

          {isHarnessRuntime ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="harness-model">Model</Label>
                <Select
                  value={harnessModelId}
                  onValueChange={onHarnessModelChange}
                >
                  <SelectTrigger id="harness-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedHarnessAdapter?.models ?? []).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="harness-effort">Reasoning</Label>
                <Select
                  value={harnessReasoningEffort}
                  onValueChange={onHarnessReasoningChange}
                >
                  <SelectTrigger id="harness-effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedHarnessAdapter?.reasoningEfforts ?? []).map(
                      (effort) => (
                        <SelectItem key={effort.id} value={effort.id}>
                          {effort.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button disabled={!canCreate} onClick={onCreate}>
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const AgentsPage: FC = () => {
  const navigate = useNavigate()
  const {
    status,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useOpenClawStatus()
  const { providers, defaultProviderId } = useLlmProviders()
  const {
    adapters,
    loading: adaptersLoading,
    error: adaptersError,
    refetch: refetchAdapters,
  } = useAgentAdapters()

  const openClawAgentsEnabled =
    status?.status === 'running' && status.controlPlaneStatus === 'connected'
  const {
    agents: openClawAgents,
    loading: openClawAgentsLoading,
    error: openClawAgentsError,
    refetch: refetchOpenClawAgents,
  } = useOpenClawAgents(openClawAgentsEnabled)
  const {
    harnessAgents,
    loading: harnessAgentsLoading,
    error: harnessAgentsError,
    refetch: refetchHarnessAgents,
  } = useHarnessAgents()
  const createHarnessAgent = useCreateHarnessAgent()
  const deleteHarnessAgent = useDeleteHarnessAgent()
  const {
    setupOpenClaw,
    createAgent: createOpenClawAgent,
    deleteAgent: deleteOpenClawAgent,
    startOpenClaw,
    stopOpenClaw,
    restartOpenClaw,
    reconnectOpenClaw,
    actionInProgress,
    settingUp,
    creating: creatingOpenClawAgent,
    deleting: deletingOpenClawAgent,
    reconnecting,
    pendingGatewayAction,
  } = useOpenClawMutations()

  const [setupOpen, setSetupOpen] = useState(false)
  const [setupProviderId, setSetupProviderId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [createRuntime, setCreateRuntime] = useState<CreateAgentRuntime>(
    DEFAULT_CREATE_RUNTIME,
  )
  const [createProviderId, setCreateProviderId] = useState('')
  const [harnessAdapterId, setHarnessAdapterId] = useState<HarnessAgentAdapter>(
    DEFAULT_HARNESS_ADAPTER,
  )
  const [harnessModelId, setHarnessModelId] = useState('')
  const [harnessReasoningEffort, setHarnessReasoningEffort] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const [cliAuthModalOpen, setCliAuthModalOpen] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingAgentKey, setDeletingAgentKey] = useState<string | null>(null)

  const cliProviderOptions = useMemo(
    () => buildOpenClawCliProviderOptions(),
    [],
  )
  const selectableOpenClawProviders = useMemo(
    () => toProviderOptions(providers, cliProviderOptions),
    [providers, cliProviderOptions],
  )
  const selectedCreateOption = selectableOpenClawProviders.find(
    (provider) => provider.id === createProviderId,
  )
  const selectedCliProvider = selectedCreateOption
    ? findOpenClawCliProviderById(selectedCreateOption.type)
    : undefined
  const selectedSetupOption = selectableOpenClawProviders.find(
    (provider) => provider.id === setupProviderId,
  )
  const selectedSetupCliProvider = selectedSetupOption
    ? findOpenClawCliProviderById(selectedSetupOption.type)
    : undefined
  const activeCliProvider =
    (setupOpen && selectedSetupCliProvider) ||
    (createOpen && createRuntime === 'openclaw' && selectedCliProvider) ||
    undefined
  const {
    data: cliAuthStatus,
    isLoading: cliAuthLoading,
    error: cliAuthError,
  } = useOpenClawCliProviderAuthStatus(
    activeCliProvider?.id ?? '',
    !!activeCliProvider,
  )

  useEffect(() => {
    if (selectableOpenClawProviders.length === 0) return
    const fallbackId =
      selectableOpenClawProviders.find(
        (provider) => provider.id === defaultProviderId,
      )?.id ?? selectableOpenClawProviders[0].id

    if (createOpen && !createProviderId) setCreateProviderId(fallbackId)
  }, [
    createOpen,
    createProviderId,
    selectableOpenClawProviders,
    defaultProviderId,
  ])

  useEffect(() => {
    if (selectableOpenClawProviders.length === 0) return
    const fallbackId =
      selectableOpenClawProviders.find(
        (provider) => provider.id === defaultProviderId,
      )?.id ?? selectableOpenClawProviders[0].id

    if (setupOpen && !setupProviderId) setSetupProviderId(fallbackId)
  }, [
    setupOpen,
    setupProviderId,
    selectableOpenClawProviders,
    defaultProviderId,
  ])

  useEffect(() => {
    if (!createOpen) return
    setNewName((current) => current || 'agent')
  }, [createOpen])

  useEffect(() => {
    if (!createOpen) return
    const adapter =
      adapters.find((entry) => entry.id === harnessAdapterId) ?? adapters[0]
    if (!adapter) return
    setHarnessAdapterId(adapter.id)
    setHarnessModelId((current) => current || adapter.defaultModelId)
    setHarnessReasoningEffort(
      (current) => current || adapter.defaultReasoningEffort,
    )
  }, [adapters, createOpen, harnessAdapterId])

  useEffect(() => {
    if (cliAuthModalOpen && cliAuthStatus?.loggedIn) {
      setCliAuthModalOpen(false)
    }
  }, [cliAuthModalOpen, cliAuthStatus?.loggedIn])

  const lifecyclePending = pendingGatewayAction !== null
  const lifecycleBanner = getLifecycleBanner(pendingGatewayAction)

  const gatewayUiState = useMemo(() => getGatewayUiState(status), [status])
  const openClawManageable = canManageOpenClawAgents(
    gatewayUiState,
    lifecyclePending,
  )
  const showControlPlaneDegraded = shouldShowControlPlaneDegraded(
    gatewayUiState,
    lifecyclePending,
  )
  const recoveryDetail = status ? getRecoveryDetail(status) : null
  const controlPlaneCopy = getControlPlaneCopyForStatus(status)
  const inlineError = getInlineError({
    lifecyclePending,
    pageError,
    statusError,
    openClawAgentsError,
    adaptersError,
    harnessAgentsError,
  })

  const visibleOpenClawAgents = getVisibleOpenClawAgents(
    openClawAgentsEnabled,
    openClawAgents,
  )
  const agentListItems = useMemo(
    () => [
      ...visibleOpenClawAgents.map((agent) =>
        toOpenClawListItem(agent, openClawManageable),
      ),
      ...[...harnessAgents]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(toHarnessListItem),
    ],
    [harnessAgents, openClawManageable, visibleOpenClawAgents],
  )
  const agentsLoading = getAgentsLoading({
    statusLoading,
    adaptersLoading,
    harnessAgentsLoading,
    openClawAgentsEnabled,
    openClawAgentsLoading,
  })
  const creatingAgent = creatingOpenClawAgent || createHarnessAgent.isPending
  const deletingAgent = deletingOpenClawAgent || deleteHarnessAgent.isPending

  const runWithPageErrorHandling = async (fn: () => Promise<unknown>) => {
    setPageError(null)
    try {
      await fn()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err))
    }
  }

  const refreshAll = async () => {
    await Promise.all([
      refetchStatus(),
      refetchAdapters(),
      refetchHarnessAgents(),
      openClawAgentsEnabled ? refetchOpenClawAgents() : Promise.resolve(),
    ])
  }

  const handleHarnessAdapterChange = (adapter: HarnessAgentAdapter) => {
    const descriptor = adapters.find((entry) => entry.id === adapter)
    setHarnessAdapterId(adapter)
    setHarnessModelId(descriptor?.defaultModelId ?? '')
    setHarnessReasoningEffort(descriptor?.defaultReasoningEffort ?? '')
  }

  const handleSetup = async () => {
    const option = selectableOpenClawProviders.find(
      (item) => item.id === setupProviderId,
    )
    const isCli = !!option && !!findOpenClawCliProviderById(option.type)
    const llmOption =
      !isCli && option ? (option as LlmProviderConfig) : undefined

    await runWithPageErrorHandling(async () => {
      await setupOpenClaw({
        providerType: option?.type,
        providerName: isCli ? undefined : option?.name,
        baseUrl: llmOption?.baseUrl,
        apiKey: llmOption?.apiKey,
        modelId: option?.modelId,
      })
      setSetupOpen(false)
      if (isCli) setCliAuthModalOpen(true)
    })
  }

  const handleOpenClawCreate = async () => {
    if (!newName.trim()) return
    const option = selectableOpenClawProviders.find(
      (item) => item.id === createProviderId,
    )
    const normalizedName = newName.trim().toLowerCase().replace(/\s+/g, '-')
    const isCli = !!option && !!findOpenClawCliProviderById(option.type)
    const llmOption =
      !isCli && option ? (option as LlmProviderConfig) : undefined

    setCreateError(null)
    try {
      const result = await createOpenClawAgent({
        name: normalizedName,
        providerType: option?.type,
        providerName: isCli ? undefined : option?.name,
        baseUrl: llmOption?.baseUrl,
        apiKey: llmOption?.apiKey,
        modelId: option?.modelId,
      })
      setCreateOpen(false)
      setNewName('')
      navigate(`/agents/${result.agent.agentId}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleHarnessCreate = async () => {
    if (!newName.trim()) return

    setCreateError(null)
    try {
      const agent = await createHarnessAgent.mutateAsync({
        name: newName.trim(),
        adapter:
          createRuntime === 'openclaw' ? harnessAdapterId : createRuntime,
        modelId: harnessModelId || undefined,
        reasoningEffort: harnessReasoningEffort || undefined,
      })
      setCreateOpen(false)
      setNewName('')
      navigate(`/agents/${agent.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCreate = () => {
    const createByRuntime: Record<CreateAgentRuntime, () => Promise<void>> = {
      openclaw: handleOpenClawCreate,
      claude: handleHarnessCreate,
      codex: handleHarnessCreate,
    }
    void createByRuntime[createRuntime]()
  }

  const handleDelete = async (agent: AgentListItem) => {
    setDeletingAgentKey(agent.key)
    await runWithPageErrorHandling(async () => {
      const deleteBySource: Record<
        AgentListItem['source'],
        (agentId: string) => Promise<unknown>
      > = {
        openclaw: (agentId) => deleteOpenClawAgent(agentId),
        'agent-harness': (agentId) => deleteHarnessAgent.mutateAsync(agentId),
      }
      await deleteBySource[agent.source](agent.agentId)
    })
    setDeletingAgentKey(null)
  }

  const handleStart = async () => {
    await runWithPageErrorHandling(async () => {
      await startOpenClaw()
    })
  }

  const handleStop = async () => {
    await runWithPageErrorHandling(async () => {
      await stopOpenClaw()
    })
  }

  const handleRestart = async () => {
    await runWithPageErrorHandling(async () => {
      await restartOpenClaw()
    })
  }

  const handleReconnect = async () => {
    await runWithPageErrorHandling(async () => {
      await reconnectOpenClaw()
    })
  }

  if (showTerminal) {
    return <AgentTerminal onBack={() => setShowTerminal(false)} />
  }

  const authTerminalProvider = selectedSetupCliProvider ?? selectedCliProvider
  if (cliAuthModalOpen && authTerminalProvider) {
    return (
      <AgentTerminal
        onBack={() => setCliAuthModalOpen(false)}
        initialCommand={authTerminalProvider.authLoginCommand}
        onSessionExit={() => setCliAuthModalOpen(false)}
      />
    )
  }

  if (statusLoading && !status) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <AgentsPageHeader
          actionInProgress={actionInProgress}
          controlPlaneBusy={gatewayUiState.controlPlaneBusy}
          reconnecting={reconnecting}
          status={status}
          onCreateAgent={() => setCreateOpen(true)}
          onOpenTerminal={() => setShowTerminal(true)}
          onReconnect={handleReconnect}
          onRefresh={() => void refreshAll()}
          onRestart={handleRestart}
          onStop={handleStop}
        />

        {lifecycleBanner ? <LifecycleAlert message={lifecycleBanner} /> : null}

        {inlineError ? (
          <InlineErrorAlert
            message={inlineError}
            onDismiss={() => setPageError(null)}
          />
        ) : null}

        {status && showControlPlaneDegraded ? (
          <ControlPlaneAlert
            actionInProgress={actionInProgress}
            controlPlaneBusy={gatewayUiState.controlPlaneBusy}
            controlPlaneCopy={controlPlaneCopy}
            reconnecting={reconnecting}
            recoveryDetail={recoveryDetail}
            status={status}
            onReconnect={handleReconnect}
            onRestart={handleRestart}
          />
        ) : null}

        <GatewayStateCards
          actionInProgress={actionInProgress}
          status={status}
          onOpenSetup={() => setSetupOpen(true)}
          onRestart={handleRestart}
          onStart={handleStart}
        />

        <AgentList
          agents={agentListItems}
          loading={agentsLoading}
          deletingAgentKey={deletingAgent ? deletingAgentKey : null}
          onChatAgent={(agent) => navigate(`/agents/${agent.agentId}`)}
          onCreateAgent={() => setCreateOpen(true)}
          onDeleteAgent={(agent) => {
            void handleDelete(agent)
          }}
        />

        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set Up OpenClaw</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <ProviderSelector
                providers={selectableOpenClawProviders}
                defaultProviderId={defaultProviderId}
                selectedId={setupProviderId}
                onSelect={setSetupProviderId}
                hideApiKeyHint={!!selectedSetupCliProvider}
              />

              {selectedSetupCliProvider ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
                  {selectedSetupCliProvider.description}. Clicking{' '}
                  <span className="font-medium">Set Up &amp; Start</span> starts
                  the gateway and opens a terminal to sign in.
                </p>
              ) : null}

              <Button
                onClick={() => void handleSetup()}
                disabled={settingUp || selectableOpenClawProviders.length === 0}
                className="w-full"
              >
                {settingUp ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Set Up & Start'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <NewAgentDialog
          adapters={adapters}
          canManageOpenClaw={openClawManageable}
          createError={createError}
          createRuntime={createRuntime}
          creating={creatingAgent}
          defaultProviderId={defaultProviderId}
          harnessAdapterId={harnessAdapterId}
          harnessModelId={harnessModelId}
          harnessReasoningEffort={harnessReasoningEffort}
          name={newName}
          open={createOpen}
          providers={selectableOpenClawProviders}
          selectedCliProvider={selectedCliProvider}
          selectedProviderId={createProviderId}
          cliAuthError={cliAuthError ?? null}
          cliAuthLoading={cliAuthLoading}
          cliAuthStatus={cliAuthStatus}
          onConnectCliProvider={() => setCliAuthModalOpen(true)}
          onCreate={handleCreate}
          onOpenChange={(open) => {
            setCreateOpen(open)
            if (!open) {
              setCreateError(null)
              createHarnessAgent.reset()
            }
          }}
          onRuntimeChange={setCreateRuntime}
          onHarnessAdapterChange={handleHarnessAdapterChange}
          onHarnessModelChange={setHarnessModelId}
          onHarnessReasoningChange={setHarnessReasoningEffort}
          onNameChange={setNewName}
          onProviderChange={setCreateProviderId}
        />
      </div>
    </div>
  )
}
