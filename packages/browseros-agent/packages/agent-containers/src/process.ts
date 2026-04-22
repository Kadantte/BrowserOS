import { spawn } from 'node:child_process'

export interface CommandRunnerOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export type CommandRunner = (
  command: string[],
  options?: CommandRunnerOptions,
) => Promise<void>

export async function runCommand(
  command: string[],
  options: CommandRunnerOptions = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
    })
    proc.once('error', reject)
    proc.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `Command failed (${code ?? 'unknown'}): ${command.join(' ')}`,
        ),
      )
    })
  })
}
