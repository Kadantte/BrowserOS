/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Agent management routes for OpenClaw Docker instances.
 * Uses the official OpenClaw Docker setup script from the OpenClaw repo.
 */

import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { logger } from '../../lib/logger'

const OPENCLAW_IMAGE = 'ghcr.io/openclaw/openclaw:latest'
const OPENCLAW_SETUP_SCRIPT_URL =
  'https://raw.githubusercontent.com/openclaw/openclaw/main/scripts/docker/setup.sh'
const OPENCLAW_COMPOSE_URL =
  'https://raw.githubusercontent.com/openclaw/openclaw/main/docker-compose.yml'

interface AgentInstance {
  id: string
  name: string
  status: 'creating' | 'running' | 'stopped' | 'error'
  port: number
  dir: string
  createdAt: string
  error?: string
}

function getAgentsBaseDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp'
  return path.join(home, '.browseros', 'agents')
}

const instances = new Map<string, AgentInstance>()

async function isDockerAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['docker', 'info'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}

async function runCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: options?.cwd,
    env: { ...process.env, ...options?.env },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
}

async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import('node:net')
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(startPort, '127.0.0.1', () => {
      server.close(() => resolve(startPort))
    })
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1))
    })
  })
}

export function createAgentsRoutes() {
  return new Hono()
    .get('/', (c) => {
      const agentList = Array.from(instances.values())
      return c.json({ agents: agentList })
    })

    .get('/docker-status', async (c) => {
      const available = await isDockerAvailable()
      return c.json({ available })
    })

    .post('/create', async (c) => {
      const body = await c.req.json<{ name: string }>()
      const name = body.name?.trim()

      if (!name) {
        return c.json({ error: 'Name is required' }, 400)
      }

      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
        return c.json(
          {
            error:
              'Name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores',
          },
          400,
        )
      }

      const existing = Array.from(instances.values()).find(
        (i) => i.name === name,
      )
      if (existing) {
        return c.json({ error: `Agent "${name}" already exists` }, 409)
      }

      const dockerAvailable = await isDockerAvailable()
      if (!dockerAvailable) {
        return c.json(
          {
            error:
              'Docker is not available. Install Docker Desktop or OrbStack to create local agents.',
          },
          503,
        )
      }

      const id = crypto.randomUUID()
      const port = await findAvailablePort(18789)
      const agentDir = path.join(getAgentsBaseDir(), name)

      const instance: AgentInstance = {
        id,
        name,
        status: 'creating',
        port,
        dir: agentDir,
        createdAt: new Date().toISOString(),
      }
      instances.set(id, instance)

      logger.info('Creating OpenClaw agent instance', {
        id,
        name,
        port,
        dir: agentDir,
      })

      // Set up and run the official OpenClaw Docker setup in the background
      ;(async () => {
        try {
          // Create agent directory
          fs.mkdirSync(agentDir, { recursive: true })

          // Download the official setup script
          const setupScriptPath = path.join(agentDir, 'setup.sh')
          const scriptRes = await fetch(OPENCLAW_SETUP_SCRIPT_URL)
          if (!scriptRes.ok) {
            throw new Error(
              `Failed to download setup script: ${scriptRes.status}`,
            )
          }
          fs.writeFileSync(setupScriptPath, await scriptRes.text())
          fs.chmodSync(setupScriptPath, 0o755)

          // Download the official docker-compose.yml
          const composeRes = await fetch(OPENCLAW_COMPOSE_URL)
          if (!composeRes.ok) {
            throw new Error(
              `Failed to download docker-compose.yml: ${composeRes.status}`,
            )
          }
          fs.writeFileSync(
            path.join(agentDir, 'docker-compose.yml'),
            await composeRes.text(),
          )

          // Run the setup script with the pre-built image
          const setup = await runCommand('bash', [setupScriptPath], {
            cwd: agentDir,
            env: {
              OPENCLAW_IMAGE: OPENCLAW_IMAGE,
              COMPOSE_PROJECT_NAME: `browseros-claw-${name}`,
            },
          })

          if (setup.exitCode !== 0) {
            throw new Error(
              `Setup script failed: ${setup.stderr || setup.stdout}`,
            )
          }

          instance.status = 'running'
          logger.info('OpenClaw agent instance started', {
            id,
            name,
            dir: agentDir,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          instance.status = 'error'
          instance.error = message
          logger.error('Failed to create OpenClaw agent instance', {
            id,
            error: message,
          })
        }
      })()

      return c.json({ agent: instance }, 201)
    })

    .post('/:id/stop', async (c) => {
      const { id } = c.req.param()
      const instance = instances.get(id)

      if (!instance) {
        return c.json({ error: 'Agent not found' }, 404)
      }

      try {
        await runCommand('docker', ['compose', 'stop'], {
          cwd: instance.dir,
          env: { COMPOSE_PROJECT_NAME: `browseros-claw-${instance.name}` },
        })
        instance.status = 'stopped'
        return c.json({ agent: instance })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return c.json({ error: `Failed to stop agent: ${message}` }, 500)
      }
    })

    .post('/:id/start', async (c) => {
      const { id } = c.req.param()
      const instance = instances.get(id)

      if (!instance) {
        return c.json({ error: 'Agent not found' }, 404)
      }

      try {
        await runCommand('docker', ['compose', 'up', '-d'], {
          cwd: instance.dir,
          env: {
            COMPOSE_PROJECT_NAME: `browseros-claw-${instance.name}`,
            OPENCLAW_IMAGE: OPENCLAW_IMAGE,
          },
        })
        instance.status = 'running'
        return c.json({ agent: instance })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return c.json({ error: `Failed to start agent: ${message}` }, 500)
      }
    })

    .delete('/:id', async (c) => {
      const { id } = c.req.param()
      const instance = instances.get(id)

      if (!instance) {
        return c.json({ error: 'Agent not found' }, 404)
      }

      try {
        // Stop and remove containers + volumes via compose
        await runCommand('docker', ['compose', 'down', '-v'], {
          cwd: instance.dir,
          env: { COMPOSE_PROJECT_NAME: `browseros-claw-${instance.name}` },
        })
        // Clean up agent directory
        fs.rmSync(instance.dir, { recursive: true, force: true })
        instances.delete(id)
        return c.json({ success: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return c.json({ error: `Failed to delete agent: ${message}` }, 500)
      }
    })
}
