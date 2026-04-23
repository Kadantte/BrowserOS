/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import { withTestEnv } from './__helpers__/run-test-group'

describe('withTestEnv', () => {
  it('defaults NODE_ENV to test when absent', () => {
    expect(withTestEnv({ PATH: '/usr/bin' }).NODE_ENV).toBe('test')
  })

  it('preserves an explicit NODE_ENV', () => {
    expect(withTestEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('production')
  })
})
