import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  BrowserOSAgentProgram,
  BrowserOSProgramRun,
  CreateAgentProgramInput,
  UpdateAgentProgramInput,
} from '@browseros/shared/types/role-programs'

interface ProgramStorageAgent {
  agentId: string
  name: string
  role?: {
    roleId?: string
  }
}

interface UpdateProgramOptions {
  touchUpdatedAt?: boolean
}

const MAX_PROGRAM_RUNS_PER_AGENT = 100

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function sortPrograms(programs: BrowserOSAgentProgram[]) {
  return [...programs].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )
}

function normalizeRuns(runs: BrowserOSProgramRun[]) {
  return [...runs]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, MAX_PROGRAM_RUNS_PER_AGENT)
}

export class OpenClawProgramStorage {
  constructor(private openclawDir: string) {}

  private getProgramsFile(agentName: string): string {
    return join(this.openclawDir, 'programs', `${agentName}.json`)
  }

  private getProgramRunsFile(agentName: string): string {
    return join(this.openclawDir, 'program-runs', `${agentName}.json`)
  }

  async listPrograms(agentName: string): Promise<BrowserOSAgentProgram[]> {
    const programs = await readJsonFile<BrowserOSAgentProgram[]>(
      this.getProgramsFile(agentName),
      [],
    )
    return sortPrograms(programs)
  }

  async getProgram(
    agentName: string,
    programId: string,
  ): Promise<BrowserOSAgentProgram | null> {
    const programs = await this.listPrograms(agentName)
    return programs.find((program) => program.id === programId) ?? null
  }

  async createProgram(
    agent: ProgramStorageAgent,
    input: CreateAgentProgramInput,
  ): Promise<BrowserOSAgentProgram> {
    const programs = await this.listPrograms(agent.name)
    const now = new Date().toISOString()

    const program: BrowserOSAgentProgram = {
      id: crypto.randomUUID(),
      agentId: agent.agentId,
      agentName: agent.name,
      roleId: agent.role?.roleId,
      name: input.name,
      description: input.description,
      prompt: input.prompt,
      schedule: input.schedule,
      enabled: input.enabled ?? true,
      standingOrders: input.standingOrders ?? [],
      createdAt: now,
      updatedAt: now,
    }

    await writeJsonFile(this.getProgramsFile(agent.name), [
      ...programs,
      program,
    ])
    return program
  }

  async updateProgram(
    agentName: string,
    programId: string,
    input: UpdateAgentProgramInput,
    options?: UpdateProgramOptions,
  ): Promise<BrowserOSAgentProgram | null> {
    const programs = await this.listPrograms(agentName)
    const current = programs.find((program) => program.id === programId)
    if (!current) return null

    const nextProgram: BrowserOSAgentProgram = {
      ...current,
      ...input,
      updatedAt:
        options?.touchUpdatedAt === false
          ? current.updatedAt
          : new Date().toISOString(),
    }

    await writeJsonFile(
      this.getProgramsFile(agentName),
      programs.map((program) =>
        program.id === programId ? nextProgram : program,
      ),
    )
    return nextProgram
  }

  async deleteProgram(agentName: string, programId: string): Promise<boolean> {
    const programs = await this.listPrograms(agentName)
    const remaining = programs.filter((program) => program.id !== programId)
    if (remaining.length === programs.length) return false

    await writeJsonFile(this.getProgramsFile(agentName), remaining)
    return true
  }

  async listRuns(agentName: string): Promise<BrowserOSProgramRun[]> {
    const runs = await readJsonFile<BrowserOSProgramRun[]>(
      this.getProgramRunsFile(agentName),
      [],
    )
    return normalizeRuns(runs)
  }

  async writeRuns(
    agentName: string,
    runs: BrowserOSProgramRun[],
  ): Promise<void> {
    await writeJsonFile(this.getProgramRunsFile(agentName), normalizeRuns(runs))
  }

  async appendRun(
    agentName: string,
    run: BrowserOSProgramRun,
  ): Promise<BrowserOSProgramRun> {
    const runs = await this.listRuns(agentName)
    await this.writeRuns(agentName, [run, ...runs])
    return run
  }

  async updateRun(
    agentName: string,
    runId: string,
    input: Partial<BrowserOSProgramRun>,
  ): Promise<BrowserOSProgramRun | null> {
    const runs = await this.listRuns(agentName)
    const current = runs.find((run) => run.id === runId)
    if (!current) return null

    const nextRun: BrowserOSProgramRun = {
      ...current,
      ...input,
    }

    await this.writeRuns(
      agentName,
      runs.map((run) => (run.id === runId ? nextRun : run)),
    )

    return nextRun
  }
}
