/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import { ImageLoader } from '../../../src/lib/podman/image-loader'
import type { PodmanShell } from '../../../src/lib/podman/podman-shell'
import { ImageLoadError, PodmanCommandError } from '../../../src/lib/vm/errors'
import type { VmManifest } from '../../../src/lib/vm/manifest'

const manifest: VmManifest = {
  schemaVersion: 2,
  updatedAt: '2026-04-22T00:00:00.000Z',
  agents: {
    openclaw: {
      image: 'ghcr.io/openclaw/openclaw',
      version: '2026.4.12',
      tarballs: {
        arm64: {
          key: 'vm/images/openclaw-2026.4.12-arm64.tar.gz',
          sha256: 'agent-arm',
          sizeBytes: 1,
        },
        x64: {
          key: 'vm/images/openclaw-2026.4.12-x64.tar.gz',
          sha256: 'agent-x64',
          sizeBytes: 1,
        },
      },
    },
  },
}

describe('ImageLoader', () => {
  it('returns without loading when the image already exists', async () => {
    const shell = new FakePodmanShell([true])
    const loader = new ImageLoader(shell as never, manifest, 'arm64')

    await loader.ensureImageLoaded('ghcr.io/openclaw/openclaw:2026.4.12')

    expect(shell.loadCalls).toEqual([])
  })

  it('loads a missing image from the guest cache and verifies it exists', async () => {
    const shell = new FakePodmanShell([false, true])
    const loader = new ImageLoader(shell as never, manifest, 'arm64')

    await loader.ensureImageLoaded('ghcr.io/openclaw/openclaw:2026.4.12')

    expect(shell.loadCalls).toEqual([
      '/mnt/browseros/cache/images/openclaw-2026.4.12-arm64.tar.gz',
    ])
    expect(shell.existsCalls).toEqual([
      'ghcr.io/openclaw/openclaw:2026.4.12',
      'ghcr.io/openclaw/openclaw:2026.4.12',
    ])
  })

  it('throws ImageLoadError when a loaded image is still absent', async () => {
    const shell = new FakePodmanShell([false, false])
    const loader = new ImageLoader(shell as never, manifest, 'arm64')

    await expect(
      loader.ensureImageLoaded('ghcr.io/openclaw/openclaw:2026.4.12'),
    ).rejects.toThrow(ImageLoadError)
  })

  it('throws ImageLoadError for unknown refs without loading', async () => {
    const shell = new FakePodmanShell([false])
    const loader = new ImageLoader(shell as never, manifest, 'arm64')

    await expect(loader.ensureImageLoaded('missing:v1')).rejects.toThrow(
      ImageLoadError,
    )
    expect(shell.loadCalls).toEqual([])
  })

  it('wraps PodmanCommandError load failures as ImageLoadError', async () => {
    const shell = new FakePodmanShell([false])
    shell.loadError = new PodmanCommandError('podman load', 125, 'bad archive')
    const loader = new ImageLoader(shell as never, manifest, 'arm64')

    const error = await loader
      .ensureImageLoaded('ghcr.io/openclaw/openclaw:2026.4.12')
      .catch((err) => err)

    expect(error).toBeInstanceOf(ImageLoadError)
    expect(error.cause).toBe(shell.loadError)
  })
})

class FakePodmanShell
  implements Pick<PodmanShell, 'imageExists' | 'loadImage'>
{
  existsCalls: string[] = []
  loadCalls: string[] = []
  loadError: Error | null = null

  constructor(private readonly existsResponses: boolean[]) {}

  async imageExists(ref: string): Promise<boolean> {
    this.existsCalls.push(ref)
    return this.existsResponses.shift() ?? false
  }

  async loadImage(path: string): Promise<string[]> {
    this.loadCalls.push(path)
    if (this.loadError) throw this.loadError
    return ['loaded']
  }
}
