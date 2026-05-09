import { storage } from '@wxt-dev/storage'
import type { ExecutionTaskRecord } from '@/lib/execution-history/types'
import { normalizeToolSequence } from './advisor'
import type {
  WorkflowUsageRecord,
  WorkflowUsageSource,
  WorkflowUsageStore,
} from './types'

const MAX_WORKFLOW_USAGE_RECORDS = 300
let pendingWorkflowUsageStorageUpdate: Promise<void> = Promise.resolve()

export const workflowUsageStorage = storage.defineItem<WorkflowUsageStore>(
  'local:workflowUsagePatterns',
  {
    fallback: { version: 1, records: [] },
    version: 1,
  },
)

export function createWorkflowUsageRecord(input: {
  id: string
  source: WorkflowUsageSource
  toolNames: string[]
  recordedAt?: number
}): WorkflowUsageRecord | null {
  const toolNames = normalizeToolSequence(input.toolNames)
  if (toolNames.length === 0) return null

  return {
    id: input.id,
    source: input.source,
    recordedAt: input.recordedAt ?? Date.now(),
    toolNames,
  }
}

export function createWorkflowUsageRecordFromExecutionTask(
  task: ExecutionTaskRecord,
): WorkflowUsageRecord | null {
  return createWorkflowUsageRecord({
    id: `execution-task:${task.id}`,
    source: 'sidepanel-chat',
    recordedAt: Date.parse(task.completedAt ?? task.startedAt),
    toolNames: task.steps.map((step) => step.toolName),
  })
}

export async function recordWorkflowUsage(
  record: WorkflowUsageRecord | null,
): Promise<void> {
  if (!record) return

  await enqueueWorkflowUsageStorageUpdate(async () => {
    const current = (await workflowUsageStorage.getValue()) ?? {
      version: 1,
      records: [],
    }
    await workflowUsageStorage.setValue(
      mergeWorkflowUsageRecord(current, record),
    )
  })
}

function enqueueWorkflowUsageStorageUpdate(
  update: () => Promise<void>,
): Promise<void> {
  const runUpdate = pendingWorkflowUsageStorageUpdate
    .catch(() => {
      // Keep later writes moving even if an earlier storage call failed.
    })
    .then(update)

  pendingWorkflowUsageStorageUpdate = runUpdate.catch(() => {
    // Store the rejection for the caller while leaving the queue usable.
  })

  return runUpdate
}

function mergeWorkflowUsageRecord(
  current: WorkflowUsageStore | null | undefined,
  record: WorkflowUsageRecord,
): WorkflowUsageStore {
  const store = current ?? {
    version: 1,
    records: [],
  }
  const recordsById = new Map(
    store.records.map((existing) => [existing.id, existing]),
  )
  recordsById.set(record.id, record)

  const records = Array.from(recordsById.values())
    .sort((left, right) => left.recordedAt - right.recordedAt)
    .slice(-MAX_WORKFLOW_USAGE_RECORDS)

  return { version: 1, records }
}

export async function getWorkflowUsageRecords(): Promise<
  WorkflowUsageRecord[]
> {
  await pendingWorkflowUsageStorageUpdate.catch(() => {
    // Preserve existing read behavior after a failed write.
  })
  const current = await workflowUsageStorage.getValue()
  return current?.records ?? []
}

export async function clearWorkflowUsageRecords(): Promise<void> {
  await enqueueWorkflowUsageStorageUpdate(async () => {
    await workflowUsageStorage.setValue({ version: 1, records: [] })
  })
}
