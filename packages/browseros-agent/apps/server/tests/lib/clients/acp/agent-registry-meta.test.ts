import { describe, expect, it } from 'bun:test'
import {
  parseNpxPackageName,
  parseSpawnCommand,
} from '../../../../src/lib/clients/acp/agent-registry-meta'

describe('parseSpawnCommand', () => {
  it('flags npx-fronted commands', () => {
    expect(parseSpawnCommand('npx -y pi-acp@^0.0.26')).toEqual({
      npxBased: true,
      bin: 'npx',
    })
  })

  it('returns the binary name for PATH-resolved commands', () => {
    expect(parseSpawnCommand('gemini --acp')).toEqual({
      npxBased: false,
      bin: 'gemini',
    })
    expect(parseSpawnCommand('openclaw acp')).toEqual({
      npxBased: false,
      bin: 'openclaw',
    })
  })

  it('also flags npm/pnpm/yarn fronted commands', () => {
    expect(parseSpawnCommand('pnpm dlx @kilocode/cli acp').npxBased).toBe(true)
  })
})

describe('parseNpxPackageName', () => {
  it('extracts a scoped package name with a version pin', () => {
    expect(
      parseNpxPackageName(
        'npx -y @agentclientprotocol/claude-agent-acp@^0.31.0',
      ),
    ).toBe('@agentclientprotocol/claude-agent-acp')
  })

  it('extracts an unscoped package with a version pin', () => {
    expect(parseNpxPackageName('npx pi-acp@^0.0.26')).toBe('pi-acp')
  })

  it('extracts a scoped package with no pin (and trailing arg)', () => {
    expect(parseNpxPackageName('npx -y @kilocode/cli acp')).toBe(
      '@kilocode/cli',
    )
  })

  it('extracts an unscoped package with no pin (and trailing arg)', () => {
    expect(parseNpxPackageName('npx -y opencode-ai acp')).toBe('opencode-ai')
  })

  it('preserves the leading @ on a scoped name without a version', () => {
    // The `@` of `@scope/pkg` is at index 0; we must not strip it.
    expect(parseNpxPackageName('npx -y @scope/pkg')).toBe('@scope/pkg')
  })

  it('returns null for non-npx commands', () => {
    expect(parseNpxPackageName('gemini --acp')).toBeNull()
    expect(parseNpxPackageName('openclaw acp')).toBeNull()
  })

  it('returns null when no positional arg follows npx', () => {
    expect(parseNpxPackageName('npx -y')).toBeNull()
    expect(parseNpxPackageName('npx')).toBeNull()
  })

  it('handles multiple flags before the package', () => {
    expect(parseNpxPackageName('npx -y --silent pi-acp@^0.0.1')).toBe('pi-acp')
  })
})
