/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it, mock } from 'bun:test'
import { OPENCLAW_CONTAINER_HOME } from '@browseros/shared/constants/openclaw'
import { OpenClawCliClient } from '../../../../src/api/services/openclaw/openclaw-cli-client'

describe('OpenClawCliClient', () => {
  it('runs upstream CLI commands without appending a gateway token flag', async () => {
    const execInContainer = mock(
      async (command: string[], onLog?: (line: string) => void) => {
        if (command[2] === 'agents' && command[3] === 'list') {
          onLog?.(
            JSON.stringify([
              {
                id: 'main',
                workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
                model: 'openrouter/anthropic/claude-sonnet-4.5',
              },
            ]),
          )
        }
        return 0
      },
    )

    const client = new OpenClawCliClient({ execInContainer })
    const agents = await client.listAgents()

    expect(execInContainer.mock.calls[0]?.[0]).toEqual([
      'node',
      'dist/index.js',
      'agents',
      'list',
      '--json',
    ])
    expect(agents[0]?.model).toBe('openrouter/anthropic/claude-sonnet-4.5')
  })

  it('derives the workspace when creating an agent', async () => {
    let callIndex = 0
    const execInContainer = mock(
      async (command: string[], onLog?: (line: string) => void) => {
        callIndex += 1
        if (callIndex === 1) {
          expect(command).toEqual([
            'node',
            'dist/index.js',
            'agents',
            'add',
            'research',
            '--workspace',
            `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
            '--model',
            'openai/gpt-5.4-mini',
            '--non-interactive',
            '--json',
          ])
          return 0
        }

        onLog?.(
          JSON.stringify([
            {
              id: 'main',
              workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
            },
            {
              id: 'research',
              workspace: `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
              model: 'openai/gpt-5.4-mini',
            },
          ]),
        )
        return 0
      },
    )

    const client = new OpenClawCliClient({ execInContainer })
    const agent = await client.createAgent({
      name: 'research',
      workspace: '/tmp/ignored',
      model: 'openai/gpt-5.4-mini',
    })

    expect(execInContainer).toHaveBeenCalledTimes(2)
    expect(agent).toEqual({
      agentId: 'research',
      name: 'research',
      workspace: `${OPENCLAW_CONTAINER_HOME}/workspace-research`,
      model: 'openai/gpt-5.4-mini',
    })
  })

  it('parses agent lists from mixed log and JSON output', async () => {
    const execInContainer = mock(
      async (_command: string[], onLog?: (line: string) => void) => {
        onLog?.('starting agent listing')
        onLog?.(
          JSON.stringify([
            {
              id: 'main',
              workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
            },
          ]),
        )
        onLog?.('done')
        return 0
      },
    )

    const client = new OpenClawCliClient({ execInContainer })
    const agents = await client.listAgents()

    expect(agents).toEqual([
      {
        agentId: 'main',
        name: 'main',
        workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
      },
    ])
  })

  it('parses pretty-printed JSON surrounded by logs', async () => {
    const execInContainer = mock(
      async (_command: string[], onLog?: (line: string) => void) => {
        onLog?.('starting agent listing')
        onLog?.('[')
        onLog?.('  {')
        onLog?.('    "id": "main",')
        onLog?.(`    "workspace": "${OPENCLAW_CONTAINER_HOME}/workspace",`)
        onLog?.('    "model": "openrouter/anthropic/claude-sonnet-4.5"')
        onLog?.('  }')
        onLog?.(']')
        onLog?.('done')
        return 0
      },
    )

    const client = new OpenClawCliClient({ execInContainer })
    const agents = await client.listAgents()

    expect(agents).toEqual([
      {
        agentId: 'main',
        name: 'main',
        workspace: `${OPENCLAW_CONTAINER_HOME}/workspace`,
        model: 'openrouter/anthropic/claude-sonnet-4.5',
      },
    ])
  })
})
