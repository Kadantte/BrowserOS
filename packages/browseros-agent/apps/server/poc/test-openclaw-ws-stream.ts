/**
 * OpenClaw PoC: WebSocket Streaming with Device Auth
 *
 * Connects to the gateway using the proper Ed25519 device identity handshake.
 * Subscribes to session events to see tool calls and reasoning in real-time.
 *
 * Run: bun run poc/test-openclaw-ws-stream.ts
 */

import crypto, { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

// ─── Load Config & Device Identity ───────────────────────

const HOME = homedir()
const config = JSON.parse(
  readFileSync(join(HOME, '.openclaw', 'openclaw.json'), 'utf-8'),
)
const gatewayToken = config.gateway?.auth?.token ?? ''

const devicePath = join(HOME, '.openclaw', 'identity', 'device.json')
const device = JSON.parse(readFileSync(devicePath, 'utf-8'))

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789'

// ─── Crypto Helpers ──────────────────────────────────────

function rawPublicKeyFromPem(pem: string): Buffer {
  const der = Buffer.from(
    pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''),
    'base64',
  )
  // SPKI for Ed25519: fixed 12-byte prefix (30 2a 30 05 06 03 2b 65 70 03 21 00) + 32 raw bytes
  return der.subarray(12)
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function signPayload(privateKeyPem: string, payload: string): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem)
  const sig = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey)
  return base64url(sig)
}

// ─── WebSocket Client ────────────────────────────────────

class OpenClawWSClient {
  private ws: WebSocket | null = null
  // biome-ignore lint/suspicious/noExplicitAny: PoC script — untyped gateway protocol
  private pendingRequests = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void }
  >()
  // biome-ignore lint/suspicious/noExplicitAny: PoC script
  private eventHandlers: Array<(event: string, payload: any) => void> = []

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(GATEWAY_URL)

      this.ws.on('message', (data: Buffer) => {
        const frame = JSON.parse(data.toString())

        // Step 1: Gateway sends challenge
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const nonce = frame.payload.nonce
          const signedAt = Date.now()
          const rawPubKey = rawPublicKeyFromPem(device.publicKeyPem)
          const deviceId = device.deviceId

          const role = 'operator'
          const scopes =
            'operator.admin,operator.read,operator.write,operator.approvals,operator.pairing'
          const clientId = 'cli'
          const clientMode = 'cli'
          const platform = process.platform

          // v3 signature payload
          const payload = `v3|${deviceId}|${clientId}|${clientMode}|${role}|${scopes}|${signedAt}|${gatewayToken}|${nonce}|${platform}|`
          const signature = signPayload(device.privateKeyPem, payload)

          // Step 2: Send connect with device identity
          this.ws?.send(
            JSON.stringify({
              type: 'req',
              id: `connect-${randomUUID().slice(0, 8)}`,
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: clientId,
                  version: '1.0.0',
                  platform,
                  mode: clientMode,
                },
                caps: [],
                commands: [],
                permissions: {},
                auth: { token: gatewayToken },
                role,
                scopes: scopes.split(','),
                device: {
                  id: deviceId,
                  publicKey: base64url(rawPubKey),
                  signature,
                  signedAt,
                  nonce,
                },
              },
            }),
          )
          return
        }

        // Step 3: hello-ok
        if (
          frame.type === 'res' &&
          frame.ok === true &&
          frame.payload?.type === 'hello-ok'
        ) {
          resolve()
          return
        }

        // Auth failure
        if (
          frame.type === 'res' &&
          frame.ok === false &&
          !this.pendingRequests.has(frame.id)
        ) {
          reject(new Error(`Connect failed: ${JSON.stringify(frame.error)}`))
          return
        }

        // RPC responses
        if (frame.type === 'res' && this.pendingRequests.has(frame.id)) {
          const pending = this.pendingRequests.get(frame.id)
          if (!pending) return
          this.pendingRequests.delete(frame.id)
          if (frame.ok === false) {
            pending.reject(
              new Error(frame.error?.message ?? JSON.stringify(frame.error)),
            )
          } else {
            pending.resolve(frame.payload)
          }
          return
        }

        // Events (tool calls, text deltas, agent steps)
        if (frame.type === 'event') {
          for (const handler of this.eventHandlers) {
            handler(frame.event, frame.payload)
          }
        }
      })

      this.ws.on('error', (err) => reject(err))
      setTimeout(() => reject(new Error('Connection timeout')), 15_000)
    })
  }

  // biome-ignore lint/suspicious/noExplicitAny: PoC script
  onEvent(handler: (event: string, payload: any) => void) {
    this.eventHandlers.push(handler)
  }

  // biome-ignore lint/suspicious/noExplicitAny: PoC script — untyped gateway protocol
  private call(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      this.pendingRequests.set(id, { resolve, reject })
      this.ws?.send(JSON.stringify({ type: 'req', id, method, params }))
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 120_000)
    })
  }

  /**
   * Send a message and wait for the full response via events.
   * Returns a promise that resolves when the agent run completes.
   */
  // biome-ignore lint/suspicious/noExplicitAny: PoC script
  async chatAndWait(
    agentId: string,
    sessionTag: string,
    message: string,
  ): Promise<any> {
    const idempotencyKey = randomUUID()

    // Set up event listener before sending
    // biome-ignore lint/suspicious/noExplicitAny: PoC script
    const waitForFinal = new Promise<any>((resolve) => {
      // biome-ignore lint/suspicious/noExplicitAny: PoC script
      const handler = (event: string, payload: any) => {
        if (event === 'chat' && payload?.state === 'final') {
          const idx = this.eventHandlers.indexOf(handler)
          if (idx >= 0) this.eventHandlers.splice(idx, 1)
          resolve(payload)
        }
      }
      this.eventHandlers.push(handler)

      // Timeout after 2 minutes
      setTimeout(() => {
        const idx = this.eventHandlers.indexOf(handler)
        if (idx >= 0) this.eventHandlers.splice(idx, 1)
        resolve({ timeout: true })
      }, 120_000)
    })

    // Send the request (returns "accepted" immediately)
    this.call('agent', {
      message,
      sessionKey: `agent:${agentId}:browseros-${sessionTag}`,
      idempotencyKey,
    }).catch(() => {})

    return waitForFinal
  }

  disconnect() {
    this.ws?.close()
  }
}

// ─── Main ─────────────────────────────────────────────────

console.log('\n  OpenClaw WebSocket Streaming PoC\n')

const client = new OpenClawWSClient()

try {
  console.log('Connecting with device identity...')
  await client.connect()
  console.log('Connected!\n')

  // Listen for ALL events to see what comes through
  client.onEvent((event, payload) => {
    const ts = new Date().toISOString().slice(11, 23)
    const summary = JSON.stringify(payload).slice(0, 150)
    console.log(`  [${ts}] EVENT: ${event}  ${summary}`)
  })

  // Test 1: Simple message — watch the events stream
  console.log('--- Test 1: Simple message ---\n')
  const res1 = await client.chatAndWait(
    'main',
    'ws-stream-test',
    'What is 2 + 2? One word answer.',
  )
  console.log(`\n  Final result:`, JSON.stringify(res1).slice(0, 200), '\n')

  // Test 2: Tool call (web search) — should show intermediate tool events
  console.log('--- Test 2: Web search (watch for tool events) ---\n')
  const res2 = await client.chatAndWait(
    'main',
    'ws-stream-test',
    'Search the web for the current temperature in London right now.',
  )
  console.log(`\n  Final result:`, JSON.stringify(res2).slice(0, 200), '\n')
} catch (err) {
  console.error('Failed:', err)
} finally {
  client.disconnect()
}
