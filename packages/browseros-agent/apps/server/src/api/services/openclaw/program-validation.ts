import type {
  BrowserOSProgramSchedule,
  BrowserOSStandingOrder,
  CreateAgentProgramInput,
  UpdateAgentProgramInput,
} from '@browseros/shared/types/role-programs'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`)
  }
}

function validateStandingOrder(value: unknown): BrowserOSStandingOrder {
  if (!isRecord(value)) {
    throw new Error('Standing orders must be objects')
  }

  assertNonEmptyString(value.title, 'Standing order title')
  assertNonEmptyString(value.instruction, 'Standing order instruction')

  if (typeof value.enabled !== 'boolean') {
    throw new Error('Standing order enabled must be a boolean')
  }

  return {
    id:
      typeof value.id === 'string' && value.id.trim() !== ''
        ? value.id
        : crypto.randomUUID(),
    title: value.title.trim(),
    instruction: value.instruction.trim(),
    enabled: value.enabled,
  }
}

function validateStandingOrders(
  value: unknown,
): BrowserOSStandingOrder[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error('standingOrders must be an array')
  }

  return value.map(validateStandingOrder)
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validateDaysOfWeek(value: unknown): Array<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  if (!Array.isArray(value)) {
    throw new Error('schedule.daysOfWeek must be an array')
  }

  return value.map((day) => {
    if (
      typeof day !== 'number' ||
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6
    ) {
      throw new Error('schedule.daysOfWeek must contain values from 0 to 6')
    }
    return day as 0 | 1 | 2 | 3 | 4 | 5 | 6
  })
}

function validateSchedule(value: unknown): BrowserOSProgramSchedule {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('schedule is required')
  }

  switch (value.type) {
    case 'manual':
      return { type: 'manual' }
    case 'daily': {
      assertNonEmptyString(value.time, 'schedule.time')
      if (!isValidTime(value.time)) {
        throw new Error('schedule.time must be in HH:MM format')
      }
      return {
        type: 'daily',
        time: value.time,
        daysOfWeek:
          value.daysOfWeek === undefined
            ? undefined
            : validateDaysOfWeek(value.daysOfWeek),
      }
    }
    case 'hourly':
    case 'minutes': {
      if (
        typeof value.interval !== 'number' ||
        !Number.isInteger(value.interval) ||
        value.interval < 1
      ) {
        throw new Error('schedule.interval must be an integer >= 1')
      }

      return {
        type: value.type,
        interval: value.interval,
      }
    }
    default:
      throw new Error('schedule.type is invalid')
  }
}

export function validateCreateProgramInput(
  value: unknown,
): CreateAgentProgramInput {
  if (!isRecord(value)) {
    throw new Error('Program payload must be an object')
  }

  assertNonEmptyString(value.name, 'name')
  assertNonEmptyString(value.description, 'description')
  assertNonEmptyString(value.prompt, 'prompt')

  return {
    name: value.name.trim(),
    description: value.description.trim(),
    prompt: value.prompt.trim(),
    schedule: validateSchedule(value.schedule),
    enabled: value.enabled === undefined ? true : !!value.enabled,
    standingOrders: validateStandingOrders(value.standingOrders) ?? [],
  }
}

export function validateUpdateProgramInput(
  value: unknown,
): UpdateAgentProgramInput {
  if (!isRecord(value)) {
    throw new Error('Program payload must be an object')
  }

  const output: UpdateAgentProgramInput = {}

  if (value.name !== undefined) {
    assertNonEmptyString(value.name, 'name')
    output.name = value.name.trim()
  }
  if (value.description !== undefined) {
    assertNonEmptyString(value.description, 'description')
    output.description = value.description.trim()
  }
  if (value.prompt !== undefined) {
    assertNonEmptyString(value.prompt, 'prompt')
    output.prompt = value.prompt.trim()
  }
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') {
      throw new Error('enabled must be a boolean')
    }
    output.enabled = value.enabled
  }
  if (value.schedule !== undefined) {
    output.schedule = validateSchedule(value.schedule)
  }
  if (value.standingOrders !== undefined) {
    output.standingOrders = validateStandingOrders(value.standingOrders)
  }

  if (Object.keys(output).length === 0) {
    throw new Error('At least one program field must be provided')
  }

  return output
}
