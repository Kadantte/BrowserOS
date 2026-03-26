import { storage } from '@wxt-dev/storage'
import type { ToolApprovalConfig } from './types'

export const toolApprovalConfigStorage = storage.defineItem<ToolApprovalConfig>(
  'local:tool-approval-config',
  {
    fallback: {
      categories: {},
    },
  },
)
