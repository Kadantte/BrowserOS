import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function getPackageRootDir(): string {
  return PACKAGE_ROOT
}

export function getDefaultConfigPath(): string {
  return join(PACKAGE_ROOT, 'config', 'agent-container-tarballs.json')
}

export function getDefaultOutputDir(): string {
  return resolve(PACKAGE_ROOT, '../../dist/agent-tarballs')
}
