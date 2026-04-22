/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import { PodmanShell } from '../../../src/lib/podman/podman-shell'

const describeIntegration = process.env.RUN_PODMAN_SHELL_INTEGRATION
  ? describe
  : describe.skip

describeIntegration('PodmanShell integration', () => {
  const vmName = process.env.PODMAN_SHELL_VM_NAME || 'browseros-vm'
  const limactlPath = process.env.PODMAN_SHELL_LIMACTL_PATH || 'limactl'
  const shell = new PodmanShell({ limactlPath, vmName })

  it('checks image existence against a real Lima VM', async () => {
    const exists = await shell.imageExists('hello-world:latest')
    expect(typeof exists).toBe('boolean')
  })

  it('lists containers against a real Lima VM', async () => {
    const containers = await shell.listContainers({ all: true })
    expect(Array.isArray(containers)).toBe(true)
  })
})
