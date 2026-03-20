import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import {
  DEFAULT_BASH_TIMEOUT,
  executeWithMetrics,
  toModelOutput,
  truncateTail,
} from './utils'

const TOOL_NAME = 'filesystem_bash'

function getShellArgs(): [string, string] {
  if (process.platform === 'win32') return ['cmd.exe', '/c']
  return [process.env.SHELL || '/bin/sh', '-c']
}

export function createBashTool(cwd: string) {
  return tool({
    description:
      'Execute a shell command and return its output. Commands run in a shell (sh/bash on Unix, cmd on Windows). Output is truncated to the last 2000 lines if too large.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
      timeout: z
        .number()
        .optional()
        .describe(`Timeout in seconds (default: ${DEFAULT_BASH_TIMEOUT})`),
    }),
    execute: (params) =>
      executeWithMetrics(TOOL_NAME, async () => {
        const [shell, flag] = getShellArgs()
        const timeoutMs = (params.timeout || DEFAULT_BASH_TIMEOUT) * 1000
        const resolvedCwd = resolve(cwd)
        const proc = spawn(shell, [flag, params.command], {
          cwd: resolvedCwd,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        })

        let timedOut = false
        let stdoutText = ''
        let stderrText = ''

        proc.stdout?.on('data', (chunk) => {
          stdoutText += chunk.toString()
        })
        proc.stderr?.on('data', (chunk) => {
          stderrText += chunk.toString()
        })

        const timer = setTimeout(() => {
          timedOut = true
          if (process.platform !== 'win32' && proc.pid) {
            try {
              process.kill(-proc.pid, 'SIGKILL')
              return
            } catch {}
          }
          proc.kill('SIGKILL')
        }, timeoutMs)

        const exitCode = await new Promise<number | null>((resolve, reject) => {
          proc.once('error', reject)
          proc.once('close', (code) => resolve(code))
        }).finally(() => {
          clearTimeout(timer)
        })

        if (timedOut) {
          let output = stdoutText
          if (stderrText) output += (output ? '\n' : '') + stderrText
          const truncated = truncateTail(output)
          return {
            text: `Command timed out after ${params.timeout || DEFAULT_BASH_TIMEOUT}s\n\n${truncated.content}`,
            isError: true,
          }
        }

        let output = stdoutText
        if (stderrText) output += (output ? '\n' : '') + stderrText

        const truncated = truncateTail(output)
        let result = truncated.content
        if (truncated.truncated) {
          result = `(Output truncated. Showing last ${truncated.keptLines} of ${truncated.totalLines} lines)\n${result}`
        }

        if (exitCode !== 0) {
          result += `\n\n[Exit code: ${exitCode}]`
          return { text: result, isError: true }
        }

        return { text: result || '(no output)' }
      }),
    toModelOutput,
  })
}
