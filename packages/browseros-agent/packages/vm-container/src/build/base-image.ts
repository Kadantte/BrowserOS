import type { Arch } from '../schema/arch'

export interface BaseImage {
  distro: 'debian'
  release: string
  channel: 'genericcloud'
  upstreamVersion: string
  arch: Arch
  url: string
  sha256: string
}

const BOOKWORM_VERSION = '20260401-1234'

// Empty-string sentinel: orchestrator.resolvePinnedSha checks against the
// 64-hex-char regex and falls back to fetching SHA256SUMS when empty. Before
// a real publish, replace these with the upstream sha256 (or let the
// scheduled base-image-bump workflow do it in a follow-up PR).
const PINNED_SHA = ''

export const DEBIAN_BASE_IMAGES: Record<Arch, BaseImage> = {
  arm64: {
    distro: 'debian',
    release: 'bookworm',
    channel: 'genericcloud',
    upstreamVersion: BOOKWORM_VERSION,
    arch: 'arm64',
    url: `https://cloud.debian.org/images/cloud/bookworm/${BOOKWORM_VERSION}/debian-12-genericcloud-arm64-${BOOKWORM_VERSION}.qcow2`,
    sha256: PINNED_SHA,
  },
  x64: {
    distro: 'debian',
    release: 'bookworm',
    channel: 'genericcloud',
    upstreamVersion: BOOKWORM_VERSION,
    arch: 'x64',
    url: `https://cloud.debian.org/images/cloud/bookworm/${BOOKWORM_VERSION}/debian-12-genericcloud-amd64-${BOOKWORM_VERSION}.qcow2`,
    sha256: PINNED_SHA,
  },
}

export const debianSha256SumsUrl = (upstreamVersion: string): string =>
  `https://cloud.debian.org/images/cloud/bookworm/${upstreamVersion}/SHA256SUMS`
