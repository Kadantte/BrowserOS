import type {
  BrowserOSAgentProgram,
  BrowserOSProgramSchedule,
} from '@browseros/shared/types/role-programs'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

function toValidDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getIntervalMs(
  schedule: Extract<BrowserOSProgramSchedule, { type: 'minutes' | 'hourly' }>,
): number {
  return schedule.type === 'minutes'
    ? schedule.interval * MINUTE_MS
    : schedule.interval * HOUR_MS
}

function getAnchorDate(program: BrowserOSAgentProgram, now: Date): Date {
  return (
    toValidDate(program.lastRunAt) ??
    toValidDate(program.updatedAt) ??
    toValidDate(program.createdAt) ??
    now
  )
}

function getNextIntervalRunAt(
  program: BrowserOSAgentProgram,
  now: Date,
): Date | null {
  const schedule = program.schedule
  if (schedule.type !== 'minutes' && schedule.type !== 'hourly') return null

  const intervalMs = getIntervalMs(schedule)
  if (intervalMs <= 0) return null

  const anchor = getAnchorDate(program, now)
  let nextRunAt = new Date(anchor.getTime() + intervalMs)

  while (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = new Date(nextRunAt.getTime() + intervalMs)
  }

  return nextRunAt
}

function getNextDailyRunAt(
  program: BrowserOSAgentProgram,
  now: Date,
): Date | null {
  if (program.schedule.type !== 'daily') return null

  const [hoursString, minutesString] = program.schedule.time.split(':')
  const hours = Number.parseInt(hoursString ?? '', 10)
  const minutes = Number.parseInt(minutesString ?? '', 10)

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  const allowedDays = program.schedule.daysOfWeek?.length
    ? new Set(program.schedule.daysOfWeek)
    : null

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + offset)
    candidate.setHours(hours, minutes, 0, 0)

    if (
      allowedDays &&
      !allowedDays.has(candidate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6)
    ) {
      continue
    }

    if (candidate.getTime() > now.getTime()) {
      return candidate
    }
  }

  return null
}

export function isSchedulableProgram(program: BrowserOSAgentProgram): boolean {
  return program.schedule.type !== 'manual'
}

export function getNextProgramRunAt(
  program: BrowserOSAgentProgram,
  now = new Date(),
): Date | null {
  if (!program.enabled || !isSchedulableProgram(program)) {
    return null
  }

  switch (program.schedule.type) {
    case 'minutes':
    case 'hourly':
      return getNextIntervalRunAt(program, now)
    case 'daily':
      return getNextDailyRunAt(program, now)
    case 'manual':
      return null
  }
}
