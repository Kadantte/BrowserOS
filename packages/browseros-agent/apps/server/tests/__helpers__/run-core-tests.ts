import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dir, '..', '..')
const cleanupScript = resolve(projectRoot, 'tests/__helpers__/cleanup.sh')
const coreTestTargets = [
  './tests/agent',
  './tests/api',
  './tests/skills',
  './tests/browseros-dir.test.ts',
  './tests/build.test.ts',
  './tests/config.test.ts',
  './tests/index.test.ts',
  './tests/main.test.ts',
]

function runCommand(cmd: string[], label: string): number {
  console.log(`\n==> ${label}`)
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 1
}

runCommand(['bash', cleanupScript], 'Cleaning up test resources')

let exitCode = 0

for (const target of coreTestTargets) {
  const status = runCommand(
    [process.execPath, '--env-file=.env.development', 'test', target],
    `Running ${target}`,
  )
  if (status !== 0) {
    exitCode = status
  }
}

process.exit(exitCode)
