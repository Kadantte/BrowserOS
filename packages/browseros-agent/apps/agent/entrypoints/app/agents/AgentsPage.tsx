import { Loader2, Terminal as TerminalIcon } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useLlmProviders } from '@/lib/llm-providers/useLlmProviders'
import { AgentList } from './AgentList'
import { AgentsHeader } from './AgentsHeader'
import { AgentTerminal } from './AgentTerminal'
import type { HarnessAgent, HarnessAgentAdapter } from './agent-harness-types'
import { createAgentPageActions } from './agents-page-actions'
import {
  useDefaultAgentName,
  useHarnessAgentDefaults,
  useHermesProviderSelection,
  useOpenClawProviderSelection,
} from './agents-page-hooks'
import {
  type CreateAgentRuntime,
  DEFAULT_CREATE_RUNTIME,
  DEFAULT_HARNESS_ADAPTER,
} from './agents-page-types'
import {
  getAgentsLoading,
  getInlineError,
  getVisibleOpenClawAgents,
  toHarnessListItem,
  toOpenClawListItem,
} from './agents-page-utils'
import { NewAgentDialog } from './NewAgentDialog'
import { InlineErrorAlert } from './OpenClawControls'
import { RuntimeControlPanel } from './runtime-controls/RuntimeControlPanel'
import { RuntimeStatusBar } from './runtime-controls/RuntimeStatusBar'
import { SetupOpenClawDialog } from './SetupOpenClawDialog'
import {
  useAgentAdapters,
  useCreateHarnessAgent,
  useDeleteHarnessAgent,
  useHarnessAgents,
  useUpdateHarnessAgent,
} from './useAgents'
import { useOpenClawAgents, useOpenClawMutations } from './useOpenClaw'
import { useRuntime } from './useRuntime'

export const AgentsPage: FC = () => {
  const navigate = useNavigate()
  const { providers, defaultProviderId } = useLlmProviders()
  const {
    adapters,
    loading: adaptersLoading,
    error: adaptersError,
  } = useAgentAdapters()

  const {
    harnessAgents,
    loading: harnessAgentsLoading,
    error: harnessAgentsError,
  } = useHarnessAgents()
  const { data: openClawRuntime } = useRuntime('openclaw')
  const openClawRunning = openClawRuntime?.status.state === 'running'

  const openClawAgentsEnabled = openClawRunning
  const {
    agents: openClawAgents,
    loading: openClawAgentsLoading,
    error: openClawAgentsError,
  } = useOpenClawAgents(openClawAgentsEnabled)
  const createHarnessAgent = useCreateHarnessAgent()
  const deleteHarnessAgent = useDeleteHarnessAgent()
  const updateHarnessAgent = useUpdateHarnessAgent()
  const {
    setupOpenClaw,
    createAgent: createOpenClawAgent,
    deleteAgent: deleteOpenClawAgent,
    settingUp,
    creating: creatingOpenClawAgent,
    deleting: deletingOpenClawAgent,
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
  const [createHermesProviderId, setCreateHermesProviderId] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const [cliAuthModalOpen, setCliAuthModalOpen] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingAgentKey, setDeletingAgentKey] = useState<string | null>(null)

  const {
    selectableOpenClawProviders,
    selectedCliProvider,
    selectedSetupCliProvider,
    authTerminalProvider,
    cliAuthStatus,
    cliAuthLoading,
    cliAuthError,
  } = useOpenClawProviderSelection({
    providers,
    defaultProviderId,
    createOpen,
    createRuntime,
    createProviderId,
    setCreateProviderId,
    setupOpen,
    setupProviderId,
    setSetupProviderId,
    cliAuthModalOpen,
    setCliAuthModalOpen,
  })
  const { selectableHermesProviders } = useHermesProviderSelection({
    providers,
    defaultProviderId,
    createOpen,
    createRuntime,
    createHermesProviderId,
    setCreateHermesProviderId,
  })
  useDefaultAgentName(createOpen, setNewName)
  useHarnessAgentDefaults({
    adapters,
    createOpen,
    harnessAdapterId,
    setHarnessAdapterId,
    setHarnessModelId,
    setHarnessReasoningEffort,
  })

  // Can the user create / modify OpenClaw agents? Yes when the runtime
  // is running. The legacy gatewayUiState/controlPlaneStatus gating is
  // gone — runtime state is the source of truth.
  const openClawManageable = openClawRunning
  const visibleOpenClawAgents = getVisibleOpenClawAgents(
    openClawAgentsEnabled,
    openClawAgents,
  )
  const agentListItems = useMemo(() => {
    // Dual-created OpenClaw agents (and the backfilled `main`/orphans
    // post Step 9) live in both `/claw/agents` and `/agents` under the
    // same id. Prefer the harness entry — it carries adapter/model/
    // reasoning/lastUsedAt/status that the chat path actually uses —
    // and drop the legacy duplicate so the rail doesn't show every
    // OpenClaw agent twice.
    const harnessIds = new Set(harnessAgents.map((agent) => agent.id))
    const dedupedOpenClawAgents = visibleOpenClawAgents.filter(
      (agent) => !harnessIds.has(agent.agentId),
    )
    return [
      ...dedupedOpenClawAgents.map((agent) =>
        toOpenClawListItem(agent, openClawManageable),
      ),
      ...harnessAgents.map(toHarnessListItem),
    ]
  }, [harnessAgents, openClawManageable, visibleOpenClawAgents])
  // Lookup map so AgentList can render adapter chips, reasoning, etc.
  // Computed up here to keep all hooks above the early returns below.
  const harnessAgentLookup = useMemo(() => {
    const map = new Map<string, HarnessAgent>()
    for (const agent of harnessAgents) map.set(agent.id, agent)
    return map
  }, [harnessAgents])
  // Activity map keyed by agentId. Sourced from the harness listing's
  // server-side enrichment (`status` + `lastUsedAt`). Legacy gateway
  // agents that don't have a harness record yet (rare post-backfill)
  // simply miss from the map and render with the default `unknown`
  // dot until reconciliation picks them up.
  const agentActivity = useMemo(() => {
    const map: Record<
      string,
      {
        status: 'working' | 'idle' | 'asleep' | 'error'
        lastUsedAt: number | null
      }
    > = {}
    for (const agent of harnessAgents) {
      if (!agent.status) continue
      map[agent.id] = {
        status: agent.status,
        lastUsedAt: agent.lastUsedAt ?? null,
      }
    }
    return map
  }, [harnessAgents])
  const inlineError = getInlineError({
    lifecyclePending: false,
    pageError,
    openClawAgentsError,
    adaptersError,
    harnessAgentsError,
  })
  const agentsLoading = getAgentsLoading({
    adaptersLoading,
    harnessAgentsLoading,
    openClawAgentsLoading,
  })
  const creatingAgent = creatingOpenClawAgent || createHarnessAgent.isPending
  const deletingAgent = deletingOpenClawAgent || deleteHarnessAgent.isPending

  const handleHarnessAdapterChange = (adapter: HarnessAgentAdapter) => {
    const descriptor = adapters.find((entry) => entry.id === adapter)
    setHarnessAdapterId(adapter)
    setHarnessModelId(descriptor?.defaultModelId ?? '')
    setHarnessReasoningEffort(descriptor?.defaultReasoningEffort ?? '')
  }

  const { handleCreate, handleDelete, handleSetup } = createAgentPageActions({
    createProviderId,
    createRuntime,
    createHermesProviderId,
    harnessModelId,
    harnessReasoningEffort,
    navigate,
    newName,
    selectableOpenClawProviders,
    selectableHermesProviders,
    setupProviderId,
    createHarnessAgent: createHarnessAgent.mutateAsync,
    createOpenClawAgent,
    deleteHarnessAgent: deleteHarnessAgent.mutateAsync,
    deleteOpenClawAgent,
    setCliAuthModalOpen,
    setCreateError,
    setCreateOpen,
    setDeletingAgentKey,
    setNewName,
    setPageError,
    setSetupOpen,
    setupOpenClaw,
  })

  if (showTerminal) {
    return <AgentTerminal onBack={() => setShowTerminal(false)} />
  }

  if (cliAuthModalOpen && authTerminalProvider) {
    return (
      <AgentTerminal
        onBack={() => setCliAuthModalOpen(false)}
        initialCommand={authTerminalProvider.authLoginCommand}
        onSessionExit={() => setCliAuthModalOpen(false)}
      />
    )
  }

  // First-paint loader: until the harness listing has resolved at
  // least once we don't know which adapters / agents to render.
  if (harnessAgentsLoading && !openClawRuntime) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Bar only makes sense when the gateway is running AND there's at
  // least one OpenClaw agent in the merged list. Hide it for
  // Claude/Codex-only setups so the page stays uncluttered.
  const showGatewayStatusBar =
    openClawRunning &&
    (visibleOpenClawAgents.length > 0 ||
      harnessAgents.some((agent) => agent.adapter === 'openclaw'))
  // Setup CTA appears when the runtime is healthy but the user has not
  // yet configured a provider (no openclaw.json on disk → runtime is
  // running but agent CRUD will fail). For now: surface it whenever the
  // runtime isn't ready, so a fresh user sees both Install + Configure
  // affordances. A future server endpoint can tell us "is setup done".
  const showSetupCta = !openClawRunning

  return (
    <div className="min-h-full bg-background px-6 py-8">
      <div className="fade-in slide-in-from-bottom-5 mx-auto flex w-full max-w-5xl animate-in flex-col gap-6 duration-500">
        <AgentsHeader onCreateAgent={() => setCreateOpen(true)} />

        {inlineError ? (
          <InlineErrorAlert
            message={inlineError}
            onDismiss={() => setPageError(null)}
          />
        ) : null}

        <RuntimeControlPanel
          adapter="openclaw"
          extras={
            showSetupCta ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSetupOpen(true)}
              >
                Configure provider…
              </Button>
            ) : null
          }
        />

        {showGatewayStatusBar ? (
          <RuntimeStatusBar
            adapter="openclaw"
            extraActions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTerminal(true)}
              >
                <TerminalIcon className="mr-1.5 h-3.5 w-3.5" />
                Terminal
              </Button>
            }
          />
        ) : null}

        <AgentList
          agents={agentListItems}
          activity={agentActivity}
          harnessAgentLookup={harnessAgentLookup}
          adapters={adapters}
          loading={agentsLoading}
          deletingAgentKey={deletingAgent ? deletingAgentKey : null}
          onCreateAgent={() => setCreateOpen(true)}
          onDeleteAgent={(agent) => {
            void handleDelete(agent)
          }}
          onPinToggle={(agent, next) => {
            // Optimistic mutation; harness-only — gateway-original
            // OpenClaw entries are gated server-side via the harness
            // backfill, so we only fire when the row maps to a
            // harness agent record.
            if (!harnessAgentLookup.has(agent.agentId)) return
            updateHarnessAgent.mutate({
              agentId: agent.agentId,
              patch: { pinned: next },
            })
          }}
        />
        <SetupOpenClawDialog
          defaultProviderId={defaultProviderId}
          open={setupOpen}
          providers={selectableOpenClawProviders}
          selectedProviderId={setupProviderId}
          selectedCliProvider={selectedSetupCliProvider}
          settingUp={settingUp}
          onOpenChange={setSetupOpen}
          onProviderChange={setSetupProviderId}
          onSetup={() => void handleSetup()}
        />
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
          hermesProviders={selectableHermesProviders}
          hermesSelectedProviderId={createHermesProviderId}
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
              setCreateHermesProviderId('')
            }
          }}
          onRuntimeChange={setCreateRuntime}
          onHarnessAdapterChange={handleHarnessAdapterChange}
          onHarnessModelChange={setHarnessModelId}
          onHarnessReasoningChange={setHarnessReasoningEffort}
          onHermesProviderChange={setCreateHermesProviderId}
          onNameChange={setNewName}
          onProviderChange={setCreateProviderId}
        />
      </div>
    </div>
  )
}
