import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { WorkflowUsageRecord, WorkflowUsageStore } from './types'

let storedValue: WorkflowUsageStore | null = null

mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => (storedValue ? structuredClone(storedValue) : null),
      setValue: async (value: WorkflowUsageStore) => {
        await Promise.resolve()
        storedValue = structuredClone(value)
      },
    }),
  },
}))

const {
  clearWorkflowUsageRecords,
  getWorkflowUsageRecords,
  recordWorkflowUsage,
} = await import('./storage')

describe('workflow usage storage', () => {
  beforeEach(() => {
    storedValue = { version: 1, records: [] }
  })

  it('serializes concurrent record writes without dropping records', async () => {
    await Promise.all([
      recordWorkflowUsage(record('record-1', ['new_page', 'navigate'], 100)),
      recordWorkflowUsage(
        record('record-2', ['search', 'get_page_content'], 200),
      ),
    ])

    expect((await getWorkflowUsageRecords()).map((item) => item.id)).toEqual([
      'record-1',
      'record-2',
    ])
  })

  it('keeps clear operations ordered with pending writes', async () => {
    const write = recordWorkflowUsage(
      record('record-1', ['new_page', 'navigate'], 100),
    )
    const clear = clearWorkflowUsageRecords()

    await Promise.all([write, clear])

    expect(await getWorkflowUsageRecords()).toEqual([])
  })
})

function record(
  id: string,
  toolNames: string[],
  recordedAt: number,
): WorkflowUsageRecord {
  return {
    id,
    source: 'sidepanel-chat',
    recordedAt,
    toolNames,
  }
}
