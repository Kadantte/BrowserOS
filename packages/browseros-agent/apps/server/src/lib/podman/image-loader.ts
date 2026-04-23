/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { basename, join } from 'node:path'
import { ImageLoadError, PodmanCommandError } from '../vm/errors'
import type { VmManifest } from '../vm/manifest'
import type { Arch } from '../vm/paths'
import { getImageCacheDir, hostPathToGuest } from '../vm/paths'
import type { PodmanShell } from './podman-shell'
import type { LogFn } from './types'

export class ImageLoader {
  constructor(
    private readonly shell: PodmanShell,
    private readonly manifest: VmManifest,
    private readonly arch: Arch,
  ) {}

  async ensureImageLoaded(ref: string, onLog?: LogFn): Promise<void> {
    if (await this.shell.imageExists(ref)) return

    const tarball = this.resolveTarball(ref)
    const hostPath = join(getImageCacheDir(), basename(tarball.key))
    const guestPath = hostPathToGuest(hostPath)

    try {
      await this.shell.loadImage(guestPath, onLog)
    } catch (error) {
      if (error instanceof PodmanCommandError) {
        throw new ImageLoadError(ref, `load failed: ${error.stderr}`, error)
      }
      throw error
    }

    if (!(await this.shell.imageExists(ref))) {
      throw new ImageLoadError(
        ref,
        `image not present after successful load of ${guestPath}`,
      )
    }
  }

  private resolveTarball(
    ref: string,
  ): VmManifest['agents'][string]['tarballs'][Arch] {
    for (const agent of Object.values(this.manifest.agents)) {
      if (`${agent.image}:${agent.version}` !== ref) continue
      const tarball = agent.tarballs[this.arch]
      if (!tarball) {
        throw new ImageLoadError(ref, `no ${this.arch} tarball in manifest`)
      }
      return tarball
    }

    throw new ImageLoadError(ref, `no agent in manifest matches ${ref}`)
  }
}
