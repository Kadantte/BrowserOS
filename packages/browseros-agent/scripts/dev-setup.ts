#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

interface EnvTarget {
  target: string
  example?: string
}

interface EnvCopyPlan {
  reason: 'example' | 'main-worktree'
  source: string
  target: string
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_TARGETS: EnvTarget[] = [
  {
    target: 'apps/agent/.env.development',
    example: 'apps/agent/.env.example',
  },
  {
    target: 'apps/server/.env.development',
    example: 'apps/server/.env.example',
  },
  {
    target: 'apps/server/.env.production',
    example: 'apps/server/.env.production.example',
  },
]

export function parsePrimaryWorktreeRoot(output: string): string | null {
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      return line.slice('worktree '.length)
    }
  }
  return null
}

export function buildEnvCopyPlans(
  repoRoot: string,
  primaryWorktreeRoot: string | null,
): EnvCopyPlan[] {
  const plans: EnvCopyPlan[] = []

  for (const envTarget of ENV_TARGETS) {
    const targetPath = join(repoRoot, envTarget.target)
    if (existsSync(targetPath)) {
      continue
    }

    const primarySourcePath = primaryWorktreeRoot
      ? join(primaryWorktreeRoot, envTarget.target)
      : null
    if (primarySourcePath && existsSync(primarySourcePath)) {
      plans.push({
        reason: 'main-worktree',
        source: primarySourcePath,
        target: targetPath,
      })
      continue
    }

    if (!envTarget.example) {
      continue
    }

    const exampleSourcePath = join(repoRoot, envTarget.example)
    if (!existsSync(exampleSourcePath)) {
      continue
    }

    plans.push({
      reason: 'example',
      source: exampleSourcePath,
      target: targetPath,
    })
  }

  return plans
}

export function resolvePrimaryWorktreeRoot(
  repoRoot: string,
  currentGitRoot: string | null,
  primaryGitRoot: string,
): string {
  if (!currentGitRoot) {
    return primaryGitRoot
  }
  return join(primaryGitRoot, relative(currentGitRoot, repoRoot))
}

function getPrimaryWorktreeRoot(repoRoot: string): string | null {
  const gitRootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const worktreeResult = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (worktreeResult.status !== 0) {
    return null
  }
  const primaryGitRoot = parsePrimaryWorktreeRoot(worktreeResult.stdout)
  if (!primaryGitRoot) {
    return null
  }
  const currentGitRoot =
    gitRootResult.status === 0 ? gitRootResult.stdout.trim() : null
  return resolvePrimaryWorktreeRoot(repoRoot, currentGitRoot, primaryGitRoot)
}

function ensureEnvFiles(repoRoot: string, plans: EnvCopyPlan[]): void {
  for (const plan of plans) {
    mkdirSync(dirname(plan.target), { recursive: true })
    copyFileSync(plan.source, plan.target)
    console.log(
      `synced ${relative(repoRoot, plan.target)} from ${plan.reason === 'main-worktree' ? 'main worktree' : 'example file'}`,
    )
  }

  const missingTargets = ENV_TARGETS.map((envTarget) =>
    join(repoRoot, envTarget.target),
  ).filter((targetPath) => !existsSync(targetPath))

  if (missingTargets.length > 0) {
    throw new Error(
      `Missing required env files (no main-worktree or example source found): ${missingTargets
        .map((targetPath) => relative(repoRoot, targetPath))
        .join(', ')}`,
    )
  }

  if (plans.length === 0) {
    console.log('env files already present, skipping sync')
  }
}

function runStep(repoRoot: string, command: string, args: string[]): void {
  console.log(`running ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const reason =
      result.signal == null
        ? `exit code ${result.status}`
        : `killed by ${result.signal}`
    throw new Error(
      `Command failed (${reason}): ${[command, ...args].join(' ')}`,
    )
  }
}

export function main(): void {
  const primaryWorktreeRoot = getPrimaryWorktreeRoot(REPO_ROOT)
  const plans = buildEnvCopyPlans(REPO_ROOT, primaryWorktreeRoot)

  ensureEnvFiles(REPO_ROOT, plans)
  runStep(REPO_ROOT, 'bun', ['install'])
  runStep(REPO_ROOT, 'bun', ['run', 'codegen:agent'])
  runStep(REPO_ROOT, 'bun', ['run', 'prepare:agent'])
}

if (import.meta.main) {
  main()
}
