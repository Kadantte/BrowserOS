import type { BrowserOsAgentAdapterType } from '@browseros/shared/types/browseros-agents'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLlmProviders } from '@/lib/llm-providers/useLlmProviders'
import { AgentChat } from './AgentChat'
import { AgentTerminal } from './AgentTerminal'
import { getOpenClawSupportedProviders } from './openclaw-supported-providers'
import {
  type AgentCatalogEntry,
  type AgentEntry,
  useAgentCatalog,
  useAgentMutations,
  useAgents,
} from './useAgents'
import {
  getModelDisplayName,
  type OpenClawStatus,
  useOpenClawMutations,
  useOpenClawStatus,
} from './useOpenClaw'

const ADAPTER_LABELS: Record<BrowserOsAgentAdapterType, string> = {
  openclaw: 'OpenClaw',
  codex_local: 'Codex local',
  claude_local: 'Claude local',
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
    description:
      'OpenClaw can create, manage, and chat with secure VM-backed agents.',
  },
  connecting: {
    badgeVariant: 'secondary',
    badgeLabel: 'Connecting',
    title: 'Connecting to Gateway',
    description: 'BrowserOS is establishing the OpenClaw control channel.',
  },
  reconnecting: {
    badgeVariant: 'secondary',
    badgeLabel: 'Reconnecting',
    title: 'Reconnecting Control Plane',
    description:
      'The gateway is up and BrowserOS is restoring the control channel.',
  },
  recovering: {
    badgeVariant: 'secondary',
    badgeLabel: 'Recovering',
    title: 'Recovering Gateway Connection',
    description:
      'BrowserOS is trying a safe recovery path for the OpenClaw control plane.',
  },
  disconnected: {
    badgeVariant: 'outline',
    badgeLabel: 'Disconnected',
    title: 'Gateway Disconnected',
    description:
      'The OpenClaw gateway is not available to BrowserOS right now.',
  },
  failed: {
    badgeVariant: 'destructive',
    badgeLabel: 'Needs Attention',
    title: 'Gateway Recovery Failed',
    description:
      'BrowserOS could not restore the OpenClaw control plane automatically.',
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

function normalizeAgentId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function getControlPlaneCopy(status: OpenClawStatus['controlPlaneStatus']) {
  return CONTROL_PLANE_COPY[status] ?? FALLBACK_CONTROL_PLANE_COPY
}

function getRecoveryDetail(status: OpenClawStatus): string | null {
  if (!status.lastRecoveryReason && !status.lastGatewayError) {
    return null
  }
  const detail = status.lastRecoveryReason
    ? RECOVERY_REASON_COPY[status.lastRecoveryReason]
    : null
  if (status.lastGatewayError && detail) {
    return `${detail} Latest gateway error: ${status.lastGatewayError}`
  }
  return status.lastGatewayError ?? detail
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

interface ControlPlaneCopyValue {
  badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive'
  badgeLabel: string
  title: string
  description: string
}

interface ProviderSelectorProps {
  providers: Array<{
    id: string
    type: string
    name: string
    modelId: string
    baseUrl?: string
    apiKey?: string
  }>
  defaultProviderId: string
  selectedId: string
  onSelect: (id: string) => void
}

interface LocalDangerousModeCopy {
  label: string
  description: string
}

const ProviderSelector: FC<ProviderSelectorProps> = ({
  providers,
  defaultProviderId,
  selectedId,
  onSelect,
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
      <label className="font-medium text-sm" htmlFor="provider-select">
        LLM Provider
      </label>
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
      <p className="text-muted-foreground text-xs">
        Uses your existing BrowserOS provider settings for OpenClaw-backed
        agents.
      </p>
    </div>
  )
}

function getLocalDangerousModeCopy(
  adapterType: BrowserOsAgentAdapterType,
): LocalDangerousModeCopy | null {
  switch (adapterType) {
    case 'codex_local':
      return {
        label: 'Dangerously bypass approvals and sandbox',
        description:
          'Runs Codex with local approvals and sandbox protections disabled.',
      }
    case 'claude_local':
      return {
        label: 'Dangerously skip permissions',
        description:
          'Runs Claude with permission prompts disabled for this agent.',
      }
    default:
      return null
  }
}

interface OpenClawRuntimeCardProps {
  status: OpenClawStatus | null
  statusLoading: boolean
  controlPlaneCopy: ControlPlaneCopyValue | null
  recoveryDetail: string | null
  compatibleProviderCount: number
  settingUp: boolean
  actionInProgress: boolean
  reconnecting: boolean
  controlPlaneDegraded: boolean
  onOpenSetup: () => void
  onStart: () => void
  onRestart: () => void
  onStop: () => void
  onReconnect: () => void
  onShowTerminal: () => void
}

const OpenClawRuntimeSummary: FC<{
  status: OpenClawStatus
  controlPlaneCopy: ControlPlaneCopyValue | null
  recoveryDetail: string | null
}> = ({ status, controlPlaneCopy, recoveryDetail }) => (
  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
    <div className="font-medium text-sm">
      {controlPlaneCopy?.title ?? 'Runtime status'}
    </div>
    <p className="mt-1 text-muted-foreground text-sm">
      {status.status === 'uninitialized'
        ? 'Set up OpenClaw to enable secure VM-backed agents.'
        : controlPlaneCopy?.description}
    </p>
    {recoveryDetail ? (
      <p className="mt-2 text-muted-foreground text-xs">{recoveryDetail}</p>
    ) : null}
  </div>
)

const OpenClawRuntimeAlert: FC<{
  status: OpenClawStatus
  controlPlaneCopy: ControlPlaneCopyValue | null
}> = ({ status, controlPlaneCopy }) => {
  const icon =
    status.controlPlaneStatus === 'failed' ? (
      <ShieldAlert />
    ) : status.controlPlaneStatus === 'recovering' ? (
      <Wrench />
    ) : (
      <WifiOff />
    )
  const variant =
    status.controlPlaneStatus === 'failed' ? 'destructive' : 'default'

  return (
    <Alert variant={variant}>
      {icon}
      <AlertTitle>{controlPlaneCopy?.title}</AlertTitle>
      <AlertDescription>{controlPlaneCopy?.description}</AlertDescription>
    </Alert>
  )
}

const OpenClawRuntimeActions: FC<{
  status: OpenClawStatus
  compatibleProviderCount: number
  settingUp: boolean
  actionInProgress: boolean
  reconnecting: boolean
  onOpenSetup: () => void
  onStart: () => void
  onRestart: () => void
  onStop: () => void
  onReconnect: () => void
  onShowTerminal: () => void
}> = ({
  status,
  compatibleProviderCount,
  settingUp,
  actionInProgress,
  reconnecting,
  onOpenSetup,
  onStart,
  onRestart,
  onStop,
  onReconnect,
  onShowTerminal,
}) => {
  const showSetup = status.status === 'uninitialized'
  const showStart =
    status.status !== 'running' && status.status !== 'uninitialized'
  const canStop = status.status === 'running'

  return (
    <div className="flex flex-wrap gap-2">
      {showSetup ? (
        <Button
          onClick={onOpenSetup}
          disabled={settingUp || compatibleProviderCount === 0}
        >
          {settingUp ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Cpu className="mr-2 size-4" />
          )}
          Set Up
        </Button>
      ) : null}

      {showStart ? (
        <Button onClick={onStart} disabled={actionInProgress}>
          Start
        </Button>
      ) : null}

      <Button variant="outline" onClick={onRestart} disabled={actionInProgress}>
        <RefreshCw className="mr-2 size-4" />
        Restart
      </Button>

      <Button
        variant="outline"
        onClick={onStop}
        disabled={actionInProgress || !canStop}
      >
        <Square className="mr-2 size-4" />
        Stop
      </Button>

      <Button
        variant="outline"
        onClick={onReconnect}
        disabled={actionInProgress}
      >
        {reconnecting ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 size-4" />
        )}
        Retry Connection
      </Button>

      <Button variant="outline" onClick={onShowTerminal}>
        <TerminalSquare className="mr-2 size-4" />
        Terminal
      </Button>
    </div>
  )
}

const OpenClawRuntimeCard: FC<OpenClawRuntimeCardProps> = ({
  status,
  statusLoading,
  controlPlaneCopy,
  recoveryDetail,
  compatibleProviderCount,
  settingUp,
  actionInProgress,
  reconnecting,
  controlPlaneDegraded,
  onOpenSetup,
  onStart,
  onRestart,
  onStop,
  onReconnect,
  onShowTerminal,
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <div>
        <CardTitle>OpenClaw Runtime</CardTitle>
        <p className="mt-1 text-muted-foreground text-sm">
          OpenClaw remains the managed runtime for secure VM-backed agents.
        </p>
      </div>
      {status ? (
        <div className="flex items-center gap-2">
          <StatusBadge status={status.status} />
          {status.status !== 'uninitialized' ? (
            <ControlPlaneBadge status={status.controlPlaneStatus} />
          ) : null}
        </div>
      ) : null}
    </CardHeader>
    <CardContent className="space-y-4">
      {statusLoading && !status ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading OpenClaw runtime state...
        </div>
      ) : null}

      {status ? (
        <>
          <OpenClawRuntimeSummary
            status={status}
            controlPlaneCopy={controlPlaneCopy}
            recoveryDetail={recoveryDetail}
          />

          {controlPlaneDegraded ? (
            <OpenClawRuntimeAlert
              status={status}
              controlPlaneCopy={controlPlaneCopy}
            />
          ) : null}

          <OpenClawRuntimeActions
            status={status}
            compatibleProviderCount={compatibleProviderCount}
            settingUp={settingUp}
            actionInProgress={actionInProgress}
            reconnecting={reconnecting}
            onOpenSetup={onOpenSetup}
            onStart={onStart}
            onRestart={onRestart}
            onStop={onStop}
            onReconnect={onReconnect}
            onShowTerminal={onShowTerminal}
          />
        </>
      ) : null}
    </CardContent>
  </Card>
)

interface AgentRegistrySectionProps {
  agents: AgentEntry[]
  loading: boolean
  deleting: boolean
  canManageOpenClawAgents: boolean
  onOpenCreate: () => void
  onDelete: (agentId: string) => void
  onOpenChat: (agent: AgentEntry) => void
}

const AgentRegistrySection: FC<AgentRegistrySectionProps> = ({
  agents,
  loading,
  deleting,
  canManageOpenClawAgents,
  onOpenCreate,
  onDelete,
  onOpenChat,
}) => (
  <section className="space-y-3">
    <div>
      <h2 className="font-semibold text-base">Agent Registry</h2>
      <p className="text-muted-foreground text-sm">
        Manage BrowserOS-owned agent definitions across supported runtimes.
      </p>
    </div>

    {loading ? (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ) : agents.length === 0 ? (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <Bot className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            No agents yet. Create one to get started.
          </p>
          <Button variant="outline" onClick={onOpenCreate}>
            <Plus className="mr-2 size-4" />
            Create Agent
          </Button>
        </CardContent>
      </Card>
    ) : (
      agents.map((agent) => {
        const adapterLabel = ADAPTER_LABELS[agent.adapterType]
        const modelLabel =
          getModelDisplayName(agent.model) ??
          (agent.adapterType === 'codex_local'
            ? 'Codex local'
            : agent.adapterType === 'claude_local'
              ? 'Claude local'
              : undefined)
        const canDelete =
          agent.adapterType !== 'openclaw' || canManageOpenClawAgents
        return (
          <Card key={agent.agentId}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Bot className="size-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <Badge variant="secondary">{adapterLabel}</Badge>
                  </div>
                  <p className="font-mono text-muted-foreground text-xs">
                    {agent.workspace}
                  </p>
                  {modelLabel ? (
                    <p className="text-muted-foreground text-xs">
                      {modelLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChat(agent)}
                  disabled={
                    agent.adapterType === 'openclaw' && !canManageOpenClawAgents
                  }
                >
                  <MessageSquare className="mr-2 size-4" />
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(agent.agentId)}
                  disabled={deleting || !canDelete}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        )
      })
    )}
  </section>
)

interface SetupOpenClawDialogProps extends ProviderSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settingUp: boolean
  onSubmit: () => void
}

const SetupOpenClawDialog: FC<SetupOpenClawDialogProps> = ({
  open,
  onOpenChange,
  providers,
  defaultProviderId,
  selectedId,
  onSelect,
  settingUp,
  onSubmit,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Set Up OpenClaw</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <ProviderSelector
          providers={providers}
          defaultProviderId={defaultProviderId}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <Button
          onClick={onSubmit}
          disabled={settingUp || providers.length === 0}
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
)

interface CreateAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  adapterOptions: AgentCatalogEntry[]
  selectedAdapterType: BrowserOsAgentAdapterType
  onAdapterTypeChange: (value: BrowserOsAgentAdapterType) => void
  newName: string
  onNameChange: (value: string) => void
  binaryPath: string
  onBinaryPathChange: (value: string) => void
  localDangerousModeCopy: LocalDangerousModeCopy | null
  localDangerousModeEnabled: boolean
  onLocalDangerousModeChange: (enabled: boolean) => void
  compatibleProviders: ProviderSelectorProps['providers']
  defaultProviderId: string
  createProviderId: string
  onCreateProviderIdChange: (value: string) => void
  creating: boolean
  catalogLoading: boolean
  canCreateOpenClawAgent: boolean
  onSubmit: () => void
}

const CreateAgentDialog: FC<CreateAgentDialogProps> = ({
  open,
  onOpenChange,
  adapterOptions,
  selectedAdapterType,
  onAdapterTypeChange,
  newName,
  onNameChange,
  binaryPath,
  onBinaryPathChange,
  localDangerousModeCopy,
  localDangerousModeEnabled,
  onLocalDangerousModeChange,
  compatibleProviders,
  defaultProviderId,
  createProviderId,
  onCreateProviderIdChange,
  creating,
  catalogLoading,
  canCreateOpenClawAgent,
  onSubmit,
}) => {
  const isLocalAdapter =
    selectedAdapterType === 'codex_local' ||
    selectedAdapterType === 'claude_local'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="agent-type">
              Runtime
            </label>
            <Select
              value={selectedAdapterType}
              onValueChange={(value) =>
                onAdapterTypeChange(value as BrowserOsAgentAdapterType)
              }
              disabled={catalogLoading}
            >
              <SelectTrigger id="agent-type">
                <SelectValue placeholder="Select a runtime" />
              </SelectTrigger>
              <SelectContent>
                {adapterOptions.map((adapter) => (
                  <SelectItem
                    key={adapter.adapterType}
                    value={adapter.adapterType}
                  >
                    {adapter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="agent-name" className="font-medium text-sm">
              Agent Name
            </label>
            <Input
              id="agent-name"
              value={newName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="research-agent"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSubmit()
                }
              }}
            />
            <p className="text-muted-foreground text-xs">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {selectedAdapterType === 'openclaw' ? (
            <ProviderSelector
              providers={compatibleProviders}
              defaultProviderId={defaultProviderId}
              selectedId={createProviderId}
              onSelect={onCreateProviderIdChange}
            />
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="agent-binary-path"
                className="font-medium text-sm"
              >
                Binary Path
              </label>
              <Input
                id="agent-binary-path"
                value={binaryPath}
                onChange={(event) => onBinaryPathChange(event.target.value)}
                placeholder={
                  selectedAdapterType === 'codex_local'
                    ? '/opt/homebrew/bin/codex'
                    : '/opt/homebrew/bin/claude'
                }
              />
              <p className="text-muted-foreground text-xs">
                BrowserOS validates the local CLI at create time using the path
                you provide.
              </p>
              {localDangerousModeCopy ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <Checkbox
                    id="agent-local-dangerous-mode"
                    checked={localDangerousModeEnabled}
                    onCheckedChange={(checked) =>
                      onLocalDangerousModeChange(checked === true)
                    }
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor="agent-local-dangerous-mode"
                      className="font-medium text-sm"
                    >
                      {localDangerousModeCopy.label}
                    </label>
                    <p className="text-muted-foreground text-xs">
                      {localDangerousModeCopy.description}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <Button
            onClick={onSubmit}
            disabled={
              creating ||
              !newName.trim() ||
              (selectedAdapterType === 'openclaw' &&
                (compatibleProviders.length === 0 ||
                  !canCreateOpenClawAgent)) ||
              (isLocalAdapter && !binaryPath.trim())
            }
            className="w-full"
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Agent'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export const AgentsPage: FC = () => {
  const {
    status,
    loading: statusLoading,
    error: statusError,
  } = useOpenClawStatus()
  const {
    setupOpenClaw,
    startOpenClaw,
    stopOpenClaw,
    restartOpenClaw,
    reconnectOpenClaw,
    actionInProgress,
    settingUp,
    reconnecting,
  } = useOpenClawMutations()
  const { providers, defaultProviderId } = useLlmProviders()
  const { agents, loading: agentsLoading, error: agentsError } = useAgents()
  const {
    adapters,
    loading: catalogLoading,
    error: catalogError,
  } = useAgentCatalog()
  const { createAgent, deleteAgent, creating, deleting } = useAgentMutations()

  const [setupOpen, setSetupOpen] = useState(false)
  const [setupProviderId, setSetupProviderId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedAdapterType, setSelectedAdapterType] =
    useState<BrowserOsAgentAdapterType>('openclaw')
  const [newName, setNewName] = useState('')
  const [binaryPath, setBinaryPath] = useState('')
  const [codexDangerousModeEnabled, setCodexDangerousModeEnabled] =
    useState(false)
  const [claudeDangerousModeEnabled, setClaudeDangerousModeEnabled] =
    useState(false)
  const [createProviderId, setCreateProviderId] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const [chatAgent, setChatAgent] = useState<{
    agentId: string
    name: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const compatibleProviders = getOpenClawSupportedProviders(providers)
  const adapterOptions = useMemo(() => {
    if (adapters.length > 0) {
      return adapters
    }
    return [
      { adapterType: 'openclaw' as const, label: ADAPTER_LABELS.openclaw },
      {
        adapterType: 'codex_local' as const,
        label: ADAPTER_LABELS.codex_local,
      },
      {
        adapterType: 'claude_local' as const,
        label: ADAPTER_LABELS.claude_local,
      },
    ]
  }, [adapters])

  const isLocalAdapter =
    selectedAdapterType === 'codex_local' ||
    selectedAdapterType === 'claude_local'
  const localDangerousModeCopy = getLocalDangerousModeCopy(selectedAdapterType)
  const localDangerousModeEnabled =
    selectedAdapterType === 'codex_local'
      ? codexDangerousModeEnabled
      : selectedAdapterType === 'claude_local'
        ? claudeDangerousModeEnabled
        : false

  useEffect(() => {
    if (
      adapterOptions.some(
        (adapter) => adapter.adapterType === selectedAdapterType,
      )
    ) {
      return
    }
    setSelectedAdapterType(adapterOptions[0]?.adapterType ?? 'openclaw')
  }, [adapterOptions, selectedAdapterType])

  useEffect(() => {
    if (compatibleProviders.length === 0) {
      return
    }
    const fallbackId =
      compatibleProviders.find((provider) => provider.id === defaultProviderId)
        ?.id ??
      compatibleProviders[0]?.id ??
      ''
    if (setupOpen && !setupProviderId) {
      setSetupProviderId(fallbackId)
    }
    if (createOpen && !createProviderId) {
      setCreateProviderId(fallbackId)
    }
  }, [
    compatibleProviders,
    createOpen,
    createProviderId,
    defaultProviderId,
    setupOpen,
    setupProviderId,
  ])

  useEffect(() => {
    if (!createOpen) {
      return
    }
    setNewName((current) => current || 'agent')
  }, [createOpen])

  useEffect(() => {
    if (!createOpen) {
      return
    }
    if (selectedAdapterType === 'codex_local' && !binaryPath) {
      setBinaryPath('/opt/homebrew/bin/codex')
    }
    if (selectedAdapterType === 'claude_local' && !binaryPath) {
      setBinaryPath('/opt/homebrew/bin/claude')
    }
    if (selectedAdapterType === 'openclaw') {
      setBinaryPath('')
    }
  }, [binaryPath, createOpen, selectedAdapterType])

  const gatewayUiState = useMemo(() => {
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
    const canManageAgents =
      status.status === 'running' && status.controlPlaneStatus === 'connected'
    const controlPlaneDegraded =
      status.status === 'running' && status.controlPlaneStatus !== 'connected'
    return {
      canManageAgents,
      controlPlaneDegraded,
      controlPlaneBusy,
    }
  }, [status])

  const recoveryDetail = status ? getRecoveryDetail(status) : null
  const controlPlaneCopy = status
    ? getControlPlaneCopy(status.controlPlaneStatus)
    : null
  const inlineError =
    error ??
    agentsError?.message ??
    catalogError?.message ??
    statusError?.message ??
    null

  const runWithErrorHandling = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const resetCreateForm = () => {
    setCreateOpen(false)
    setNewName('')
    setBinaryPath('')
    setCodexDangerousModeEnabled(false)
    setClaudeDangerousModeEnabled(false)
  }

  const handleSetup = async () => {
    const provider = compatibleProviders.find(
      (item) => item.id === setupProviderId,
    )
    await runWithErrorHandling(async () => {
      await setupOpenClaw({
        providerType: provider?.type,
        providerName: provider?.name,
        baseUrl: provider?.baseUrl,
        apiKey: provider?.apiKey,
        modelId: provider?.modelId,
      })
      setSetupOpen(false)
    })
  }

  const handleCreate = async () => {
    const normalizedId = normalizeAgentId(newName)
    if (!normalizedId) {
      setError('Agent name must contain letters, numbers, or hyphens.')
      return
    }
    const provider = compatibleProviders.find(
      (item) => item.id === createProviderId,
    )
    if (isLocalAdapter && !binaryPath.trim()) {
      setError('Local adapters require a binary path.')
      return
    }
    await runWithErrorHandling(async () => {
      await createAgent({
        id: normalizedId,
        name: normalizedId,
        adapterType: selectedAdapterType,
        binaryPath: isLocalAdapter ? binaryPath.trim() : undefined,
        dangerouslyBypassApprovalsAndSandbox:
          selectedAdapterType === 'codex_local'
            ? codexDangerousModeEnabled
            : undefined,
        dangerouslySkipPermissions:
          selectedAdapterType === 'claude_local'
            ? claudeDangerousModeEnabled
            : undefined,
        providerType:
          selectedAdapterType === 'openclaw' ? provider?.type : undefined,
        providerName:
          selectedAdapterType === 'openclaw' ? provider?.name : undefined,
        baseUrl:
          selectedAdapterType === 'openclaw' ? provider?.baseUrl : undefined,
        apiKey:
          selectedAdapterType === 'openclaw' ? provider?.apiKey : undefined,
        modelId:
          selectedAdapterType === 'openclaw' ? provider?.modelId : undefined,
      })
      resetCreateForm()
    })
  }

  const handleDelete = async (agentId: string) => {
    await runWithErrorHandling(async () => {
      await deleteAgent(agentId)
    })
  }

  if (showTerminal) {
    return <AgentTerminal onBack={() => setShowTerminal(false)} />
  }

  if (chatAgent) {
    return (
      <AgentChat
        agentId={chatAgent.agentId}
        agentName={chatAgent.name}
        onBack={() => setChatAgent(null)}
      />
    )
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Agents</h1>
          <p className="text-muted-foreground text-sm">
            Create BrowserOS agents with OpenClaw, Codex local, or Claude local.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={creating || catalogLoading}
        >
          <Plus className="mr-2 size-4" />
          New Agent
        </Button>
      </div>

      {inlineError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Agent action failed</AlertTitle>
          <AlertDescription>
            <p>{inlineError}</p>
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <OpenClawRuntimeCard
        status={status}
        statusLoading={statusLoading}
        controlPlaneCopy={controlPlaneCopy}
        recoveryDetail={recoveryDetail}
        compatibleProviderCount={compatibleProviders.length}
        settingUp={settingUp}
        actionInProgress={actionInProgress}
        reconnecting={reconnecting}
        controlPlaneDegraded={gatewayUiState.controlPlaneDegraded}
        onOpenSetup={() => setSetupOpen(true)}
        onStart={() => {
          void runWithErrorHandling(async () => {
            await startOpenClaw()
          })
        }}
        onRestart={() => {
          void runWithErrorHandling(async () => {
            await restartOpenClaw()
          })
        }}
        onStop={() => {
          void runWithErrorHandling(async () => {
            await stopOpenClaw()
          })
        }}
        onReconnect={() => {
          void runWithErrorHandling(async () => {
            await reconnectOpenClaw()
          })
        }}
        onShowTerminal={() => setShowTerminal(true)}
      />

      <AgentRegistrySection
        agents={agents}
        loading={agentsLoading}
        deleting={deleting}
        canManageOpenClawAgents={gatewayUiState.canManageAgents}
        onOpenCreate={() => setCreateOpen(true)}
        onDelete={(agentId) => {
          void handleDelete(agentId)
        }}
        onOpenChat={(agent) =>
          setChatAgent({
            agentId: agent.agentId,
            name: agent.name,
          })
        }
      />

      <SetupOpenClawDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        providers={compatibleProviders}
        defaultProviderId={defaultProviderId}
        selectedId={setupProviderId}
        onSelect={setSetupProviderId}
        settingUp={settingUp}
        onSubmit={() => {
          void handleSetup()
        }}
      />

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        adapterOptions={adapterOptions}
        selectedAdapterType={selectedAdapterType}
        onAdapterTypeChange={setSelectedAdapterType}
        newName={newName}
        onNameChange={setNewName}
        binaryPath={binaryPath}
        onBinaryPathChange={setBinaryPath}
        localDangerousModeCopy={localDangerousModeCopy}
        localDangerousModeEnabled={localDangerousModeEnabled}
        onLocalDangerousModeChange={(enabled) => {
          if (selectedAdapterType === 'codex_local') {
            setCodexDangerousModeEnabled(enabled)
            return
          }
          if (selectedAdapterType === 'claude_local') {
            setClaudeDangerousModeEnabled(enabled)
          }
        }}
        compatibleProviders={compatibleProviders}
        defaultProviderId={defaultProviderId}
        createProviderId={createProviderId}
        onCreateProviderIdChange={setCreateProviderId}
        creating={creating}
        catalogLoading={catalogLoading}
        canCreateOpenClawAgent={gatewayUiState.canManageAgents}
        onSubmit={() => {
          void handleCreate()
        }}
      />
    </div>
  )
}
