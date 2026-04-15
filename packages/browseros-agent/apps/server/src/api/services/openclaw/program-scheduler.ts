import type {
  BrowserOSAgentProgram,
  BrowserOSProgramRun,
} from '@browseros/shared/types/role-programs'
import { logger } from '../../../lib/logger'
import type { OpenClawProgramMaterializer } from './program-materializer'
import { getNextProgramRunAt, isSchedulableProgram } from './program-schedule'
import type { OpenClawProgramStorage } from './program-storage'

interface ScheduledProgramHandle {
  programId: string
  agentId: string
  agentName: string
  timeout: ReturnType<typeof setTimeout>
  nextRunAt: string
}

export interface OpenClawSchedulerSnapshot {
  running: boolean
  activeProgramCount: number
}

export class OpenClawProgramScheduler {
  private handles = new Map<string, ScheduledProgramHandle>()
  private running = false

  constructor(
    private programStorage: OpenClawProgramStorage,
    private programMaterializer: OpenClawProgramMaterializer,
    private runProgram: (
      agentId: string,
      program: BrowserOSAgentProgram,
      trigger: 'manual' | 'schedule' | 'retry',
    ) => Promise<BrowserOSProgramRun>,
    private listAgents: () => Promise<Array<{ agentId: string; name: string }>>,
  ) {}

  getSnapshot(): OpenClawSchedulerSnapshot {
    return {
      running: this.running,
      activeProgramCount: this.handles.size,
    }
  }

  async start(): Promise<void> {
    this.running = true
    await this.rehydrate()
  }

  async stop(): Promise<void> {
    this.running = false
    this.clearAllHandles()
  }

  async rehydrate(): Promise<void> {
    this.clearAllHandles()
    if (!this.running) return

    const agents = await this.listAgents()
    for (const agent of agents) {
      await this.refreshAgent(agent.name)
    }
  }

  async refreshAgent(agentName: string): Promise<void> {
    this.clearAgentHandles(agentName)

    const programs = await this.programStorage.listPrograms(agentName)
    let materialized = false

    for (const program of programs) {
      const changed = await this.syncProgram(program)
      materialized = materialized || changed
    }

    if (materialized) {
      await this.programMaterializer.syncAgentPrograms(agentName)
    }
  }

  async refreshProgram(agentName: string, programId: string): Promise<void> {
    this.clearProgramHandle(programId)

    const program = await this.programStorage.getProgram(agentName, programId)
    const changed = program ? await this.syncProgram(program) : false

    if (changed) {
      await this.programMaterializer.syncAgentPrograms(agentName)
    }
  }

  async removeProgram(programId: string): Promise<void> {
    this.clearProgramHandle(programId)
  }

  private clearAllHandles(): void {
    for (const handle of this.handles.values()) {
      clearTimeout(handle.timeout)
    }
    this.handles.clear()
  }

  private clearAgentHandles(agentName: string): void {
    for (const [programId, handle] of this.handles.entries()) {
      if (handle.agentName !== agentName) continue
      clearTimeout(handle.timeout)
      this.handles.delete(programId)
    }
  }

  private clearProgramHandle(programId: string): void {
    const handle = this.handles.get(programId)
    if (!handle) return

    clearTimeout(handle.timeout)
    this.handles.delete(programId)
  }

  private async syncProgram(program: BrowserOSAgentProgram): Promise<boolean> {
    if (!this.running) {
      return false
    }

    if (!program.enabled || !isSchedulableProgram(program)) {
      if (!program.nextRunAt) return false

      await this.programStorage.updateProgram(
        program.agentName,
        program.id,
        { nextRunAt: undefined },
        { touchUpdatedAt: false },
      )
      return true
    }

    const nextRunAt = getNextProgramRunAt(program)
    const nextRunAtIso = nextRunAt?.toISOString()
    let changed = false

    if (program.nextRunAt !== nextRunAtIso) {
      await this.programStorage.updateProgram(
        program.agentName,
        program.id,
        { nextRunAt: nextRunAtIso },
        { touchUpdatedAt: false },
      )
      changed = true
    }

    if (!nextRunAt) {
      return changed
    }

    const delayMs = Math.max(1000, nextRunAt.getTime() - Date.now())
    const timeout = setTimeout(() => {
      void this.executeScheduledProgram({
        agentId: program.agentId,
        agentName: program.agentName,
        programId: program.id,
      })
    }, delayMs)

    this.handles.set(program.id, {
      programId: program.id,
      agentId: program.agentId,
      agentName: program.agentName,
      timeout,
      nextRunAt: nextRunAtIso ?? program.nextRunAt ?? new Date().toISOString(),
    })

    return changed
  }

  private async executeScheduledProgram(input: {
    agentId: string
    agentName: string
    programId: string
  }): Promise<void> {
    this.handles.delete(input.programId)
    if (!this.running) return

    const program = await this.programStorage.getProgram(
      input.agentName,
      input.programId,
    )

    if (!program || !program.enabled || !isSchedulableProgram(program)) {
      await this.refreshProgram(input.agentName, input.programId)
      return
    }

    try {
      await this.runProgram(input.agentId, program, 'schedule')
      logger.info('Scheduled program run completed', {
        agentId: input.agentId,
        agentName: input.agentName,
        programId: input.programId,
      })
    } catch (error) {
      logger.error('Scheduled program run failed', {
        agentId: input.agentId,
        agentName: input.agentName,
        programId: input.programId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (this.running) {
        await this.refreshProgram(input.agentName, input.programId)
      }
    }
  }
}
