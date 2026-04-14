export type BrowserOSProgramSchedule =
  | {
      type: 'daily'
      time: string
      daysOfWeek?: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>
    }
  | {
      type: 'hourly'
      interval: number
    }
  | {
      type: 'minutes'
      interval: number
    }
  | {
      type: 'manual'
    }

export interface BrowserOSStandingOrder {
  id: string
  title: string
  instruction: string
  enabled: boolean
}

export interface BrowserOSAgentProgram {
  id: string
  agentId: string
  agentName: string
  roleId?: string
  name: string
  description: string
  prompt: string
  schedule: BrowserOSProgramSchedule
  enabled: boolean
  standingOrders: BrowserOSStandingOrder[]
  createdAt: string
  updatedAt: string
  lastRunAt?: string
}

export interface BrowserOSProgramRun {
  id: string
  programId: string
  agentId: string
  startedAt: string
  completedAt?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  trigger: 'manual' | 'schedule' | 'retry'
  summary?: string
  finalResult?: string
  error?: string
  sessionKey?: string
}

export interface CreateAgentProgramInput {
  name: string
  description: string
  prompt: string
  schedule: BrowserOSProgramSchedule
  enabled?: boolean
  standingOrders?: BrowserOSStandingOrder[]
}

export interface UpdateAgentProgramInput {
  name?: string
  description?: string
  prompt?: string
  schedule?: BrowserOSProgramSchedule
  enabled?: boolean
  standingOrders?: BrowserOSStandingOrder[]
}
