export const ARCHES = ['arm64', 'x64'] as const
export type Arch = (typeof ARCHES)[number]

export function parseArch(s: string): Arch {
  if (s === 'arm64' || s === 'x64') return s
  throw new Error(`invalid arch: ${s} (expected 'arm64' | 'x64')`)
}

// YYYY.MM.DD with an optional `-<suffix>` where suffix is alphanumeric
// (e.g. `-1`, `-rc1`, `-dev1`). The suffix lets dev/test builds carry a
// visible tag so they don't collide with real releases.
export const CALVER_REGEX = /^\d{4}\.\d{2}\.\d{2}(-[a-z0-9]+)?$/

export function assertCalver(version: string): void {
  if (!CALVER_REGEX.test(version)) {
    throw new Error(
      `invalid CalVer: ${version} (expected YYYY.MM.DD[-suffix], e.g. 2026.04.22 or 2026.04.22-1 or 2026.04.22-dev1)`,
    )
  }
}

export function todayCalver(suffix?: string): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const base = `${yyyy}.${mm}.${dd}`
  return suffix ? `${base}-${suffix}` : base
}
