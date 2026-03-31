/**
 * OpenClaw PoC: Multiple Agents + Multiple Sessions
 *
 * Uses `openclaw gateway call agent` via Bun.spawn.
 * The gateway handles auth, session routing, and persistence.
 *
 * Run: bun run poc/test-openclaw-multi.ts
 */

import { randomUUID } from 'node:crypto'

// ─── Types ───────────────────────────────────────────────

interface AgentResult {
  payloads: Array<{ text: string; mediaUrl: string | null }>
  meta: {
    durationMs: number
    agentMeta: {
      sessionId: string
      provider: string
      model: string
      usage: { input: number; output: number; total: number }
    }
  }
}

interface AgentResponse {
  text: string
  sessionId: string
  model: string
  durationMs: number
  tokens: number
}

// ─── OpenClaw Client ─────────────────────────────────────

class OpenClawClient {
  /**
   * Send a message to an OpenClaw agent session via the gateway.
   *
   * @param agentId    - Agent name ("main", "code-helper", etc.)
   * @param sessionTag - Unique conversation identifier
   * @param message    - User message text
   */
  async chat(
    agentId: string,
    sessionTag: string,
    message: string,
  ): Promise<AgentResponse> {
    const sessionKey = `agent:${agentId}:browseros-${sessionTag}`

    const params = JSON.stringify({
      message,
      sessionKey,
      idempotencyKey: randomUUID(),
    })

    const proc = Bun.spawn(
      [
        'openclaw',
        'gateway',
        'call',
        'agent',
        '--params',
        params,
        '--expect-final',
        '--json',
        '--timeout',
        '120000',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      throw new Error(`openclaw failed (${exitCode}): ${stderr}`)
    }

    // Parse JSON — skip log lines before the JSON object
    const jsonStart = stdout.indexOf('{')
    if (jsonStart === -1) throw new Error('No JSON in output')

    const data = JSON.parse(stdout.slice(jsonStart))
    const result: AgentResult = data.result ?? data
    const meta = result.meta?.agentMeta

    return {
      text: result.payloads.map((p) => p.text).join('\n'),
      sessionId: meta?.sessionId ?? 'unknown',
      model: meta?.model ?? 'unknown',
      durationMs: result.meta?.durationMs ?? 0,
      tokens: meta?.usage?.total ?? 0,
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────

function print(label: string, res: AgentResponse) {
  console.log(`  [${label}]`)
  console.log(
    `  Model:    ${res.model}  |  Session: ${res.sessionId.slice(0, 8)}...`,
  )
  console.log(`  Duration: ${res.durationMs}ms  |  Tokens: ${res.tokens}`)
  console.log(`  Response: ${res.text.slice(0, 200)}`)
  console.log()
}

// ─── Tests ────────────────────────────────────────────────

async function testMultipleSessionsSameAgent(client: OpenClawClient) {
  console.log('═══════════════════════════════════════════════')
  console.log('  TEST 1: Multiple Sessions, Same Agent')
  console.log('═══════════════════════════════════════════════\n')

  const convA = randomUUID()
  const convB = randomUUID()

  console.log('-- Turn 1: Start two conversations --\n')
  const [a1, b1] = await Promise.all([
    client.chat(
      'main',
      convA,
      'Top 3 places in Tokyo. One line each, no extras.',
    ),
    client.chat(
      'main',
      convB,
      'Top 3 places in Berlin. One line each, no extras.',
    ),
  ])
  print('Conv A - Tokyo', a1)
  print('Conv B - Berlin', b1)

  console.log('-- Turn 2: Follow-ups (session memory) --\n')
  const [a2, b2] = await Promise.all([
    client.chat('main', convA, 'Which of those 3 has the best nightlife?'),
    client.chat('main', convB, 'Which of those 3 has the best museums?'),
  ])
  print('Conv A - Tokyo nightlife', a2)
  print('Conv B - Berlin museums', b2)

  console.log('-- Turn 3: Isolation check --\n')
  const [a3, b3] = await Promise.all([
    client.chat('main', convA, 'What city are we discussing? Just the name.'),
    client.chat('main', convB, 'What city are we discussing? Just the name.'),
  ])
  print('Conv A - should say Tokyo', a3)
  print('Conv B - should say Berlin', b3)
}

async function testMultipleAgents(client: OpenClawClient) {
  console.log('═══════════════════════════════════════════════')
  console.log('  TEST 2: Multiple Agents, Different Models')
  console.log('═══════════════════════════════════════════════\n')

  const convId = randomUUID()
  const question = 'Write a one-line JS function that reverses a string.'

  const [main, helper] = await Promise.all([
    client.chat('main', convId, question),
    client.chat('code-helper', convId, question),
  ])

  print('Agent "main" (opus)', main)
  print('Agent "code-helper" (sonnet)', helper)
}

async function testSessionFactory(client: OpenClawClient) {
  console.log('═══════════════════════════════════════════════')
  console.log('  TEST 3: BrowserOS Session Factory Pattern')
  console.log('═══════════════════════════════════════════════\n')

  const users = [
    { id: randomUUID(), name: 'Alice', q: 'What is TypeScript? One sentence.' },
    { id: randomUUID(), name: 'Bob', q: 'What is Rust? One sentence.' },
    { id: randomUUID(), name: 'Carol', q: 'What is Go? One sentence.' },
  ]

  console.log('-- 3 parallel user messages --\n')
  const results = await Promise.all(
    users.map((u) => client.chat('main', u.id, u.q)),
  )
  for (let i = 0; i < users.length; i++) {
    print(users[i].name, results[i])
  }

  console.log('-- Alice follow-up (others unaffected) --\n')
  const followUp = await client.chat(
    'main',
    users[0].id,
    'Give me one code example.',
  )
  print('Alice follow-up', followUp)
}

async function testToolCalls(client: OpenClawClient) {
  console.log('═══════════════════════════════════════════════')
  console.log('  TEST 4: Tool Calls (Web Search + Multi-Step)')
  console.log('═══════════════════════════════════════════════\n')

  const convId = randomUUID()

  // This triggers a web search tool call — OpenClaw will use its web_search tool
  const res = await client.chat(
    'main',
    convId,
    'Search the web for the current population of Japan. Then calculate how many times larger it is than Iceland (population ~380,000). Show your math.',
  )

  console.log(
    `  Payloads received: ${res.text.split('\n').length > 1 ? 'multiple' : '1'}`,
  )
  console.log(`  Duration: ${res.durationMs}ms  |  Tokens: ${res.tokens}`)
  console.log()

  // Show each payload separately to see intermediate steps
  const lines = res.text.split('\n')
  lines.forEach((line, i) => {
    if (line.trim()) {
      console.log(`  [Payload ${i + 1}] ${line.slice(0, 300)}`)
      console.log()
    }
  })
}

// ─── Main ─────────────────────────────────────────────────

const client = new OpenClawClient()

console.log('\n  OpenClaw Multi-Agent Multi-Session PoC\n')

try {
  await testMultipleSessionsSameAgent(client)
  await testMultipleAgents(client)
  await testSessionFactory(client)
  await testToolCalls(client)

  console.log('═══════════════════════════════════════════════')
  console.log('  ALL TESTS COMPLETE')
  console.log('═══════════════════════════════════════════════')
} catch (err) {
  console.error('Test failed:', err)
}
