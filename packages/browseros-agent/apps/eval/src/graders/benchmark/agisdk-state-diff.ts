import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { GraderResult } from '../../types'
import type { Grader, GraderInput } from '../types'

const EVAL_SCRIPT = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'scripts',
  'agisdk-evaluate.py',
)

export class AgisdkStateDiffGrader implements Grader {
  name = 'agisdk_state_diff'

  async grade(input: GraderInput): Promise<GraderResult> {
    const taskId = this.extractTaskId(input.task.query_id)
    const startUrl = this.extractStartUrl(input)

    if (!startUrl) {
      return {
        score: 0,
        pass: false,
        reasoning: 'Could not determine clone site URL from task',
      }
    }

    const origin = new URL(startUrl).origin

    let envState: Record<string, unknown>
    try {
      envState = await this.fetchFinishState(origin)
    } catch (error) {
      return {
        score: 0,
        pass: false,
        reasoning: `Failed to fetch /finish endpoint: ${error instanceof Error ? error.message : String(error)}`,
        details: { origin, error: true },
      }
    }

    try {
      const result = await this.runPythonEvaluator(
        taskId,
        envState,
        input.finalAnswer || '',
      )
      return {
        score: result.reward,
        pass: result.pass,
        reasoning:
          result.message ||
          (result.pass ? 'All criteria passed' : 'Some criteria failed'),
        details: {
          reward: result.reward,
          per_criterion: result.per_criterion,
          origin,
          agisdk_task_id: taskId,
        },
      }
    } catch (error) {
      return {
        score: 0,
        pass: false,
        reasoning: `Python evaluator error: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: true },
      }
    }
  }

  private extractTaskId(queryId: string): string {
    return queryId.replace(/^agisdk-/, '')
  }

  private extractStartUrl(input: GraderInput): string | null {
    // The task object may carry start_url if passed through
    const metadata = input.task as Record<string, unknown>
    if (metadata.start_url && typeof metadata.start_url === 'string') {
      return metadata.start_url
    }

    // Try extracting vercel.app URLs from messages (user text or tool inputs)
    for (const msg of input.messages) {
      const text =
        msg.type === 'user'
          ? msg.content
          : msg.type === 'tool-input-available'
            ? JSON.stringify(msg.input)
            : ''
      const urlMatch = text.match(/https?:\/\/[^\s"']+\.vercel\.app/)
      if (urlMatch) return urlMatch[0]
    }

    // Fallback: try reading task metadata from output dir
    try {
      const fs = require('node:fs')
      const metaPath = join(input.outputDir, 'metadata.json')
      const raw = fs.readFileSync(metaPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed.start_url) return parsed.start_url
    } catch {
      // metadata.json not available
    }

    return null
  }

  private async fetchFinishState(
    origin: string,
  ): Promise<Record<string, unknown>> {
    const url = `${origin}/finish`
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(
        `/finish returned ${response.status}: ${response.statusText}`,
      )
    }

    return (await response.json()) as Record<string, unknown>
  }

  private runPythonEvaluator(
    taskId: string,
    envState: Record<string, unknown>,
    modelResponse: string,
  ): Promise<{
    reward: number
    pass: boolean
    message: string
    per_criterion: unknown[]
  }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [EVAL_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const inputData = JSON.stringify({
        task_id: taskId,
        env_state: envState,
        model_response: modelResponse,
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(`Python evaluator exited with code ${code}: ${stderr}`),
          )
          return
        }

        try {
          const result = JSON.parse(stdout.trim())
          resolve(result)
        } catch {
          reject(new Error(`Failed to parse evaluator output: ${stdout}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Python evaluator: ${err.message}`))
      })

      proc.stdin.write(inputData)
      proc.stdin.end()
    })
  }
}
