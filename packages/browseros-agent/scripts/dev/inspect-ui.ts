#!/usr/bin/env bun

const DEFAULT_CDP_PORT = 9010
const REQUEST_TIMEOUT_MS = 30_000
const EXTENSION_ID = 'bflpfmnmnokmjhmgnolecpppdbdophmk'

// ─── CDP WebSocket Client ────────────────────────────────────────────

type CDPResponse = {
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
  sessionId?: string
}

type CDPEvent = {
  method: string
  params?: Record<string, unknown>
  sessionId?: string
}

class CDPClient {
  private ws!: WebSocket
  private nextId = 1
  private pending = new Map<
    number,
    {
      resolve: (v: Record<string, unknown>) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  private constructor() {}

  static async connect(port: number): Promise<CDPClient> {
    const client = new CDPClient()
    const versionUrl = `http://127.0.0.1:${port}/json/version`
    let resp: Response
    try {
      resp = await fetch(versionUrl)
    } catch {
      throw new Error(
        `Cannot reach CDP at ${versionUrl}. Is BrowserOS running with --cdp-port=${port}?`,
      )
    }
    const info = (await resp.json()) as { webSocketDebuggerUrl: string }
    let wsUrl = info.webSocketDebuggerUrl
    if (!wsUrl) throw new Error('No webSocketDebuggerUrl in /json/version')
    wsUrl = wsUrl.replace(/ws:\/\/[^/]+/, `ws://127.0.0.1:${port}`)

    return new Promise((resolve, reject) => {
      client.ws = new WebSocket(wsUrl)
      client.ws.onopen = () => resolve(client)
      client.ws.onerror = (e) =>
        reject(new Error(`WebSocket error: ${(e as ErrorEvent).message}`))
      client.ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as CDPResponse | CDPEvent
        if ('id' in msg && msg.id !== undefined) {
          const entry = client.pending.get(msg.id)
          if (entry) {
            client.pending.delete(msg.id)
            clearTimeout(entry.timer)
            if (msg.error) {
              entry.reject(
                new Error(`CDP error ${msg.error.code}: ${msg.error.message}`),
              )
            } else {
              entry.resolve(msg.result ?? {})
            }
          }
        }
      }
      client.ws.onclose = () => {
        for (const [, entry] of client.pending) {
          clearTimeout(entry.timer)
          entry.reject(new Error('WebSocket closed'))
        }
        client.pending.clear()
      }
    })
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      const msg: Record<string, unknown> = { id, method, params }
      if (sessionId) msg.sessionId = sessionId
      this.ws.send(JSON.stringify(msg))
    })
  }

  close() {
    this.ws.close()
  }
}

// ─── Target resolution ───────────────────────────────────────────────

type TargetInfo = {
  targetId: string
  type: string
  title: string
  url: string
}

async function getTargets(cdp: CDPClient): Promise<TargetInfo[]> {
  const result = await cdp.send('Target.getTargets')
  return (result.targetInfos as TargetInfo[]) ?? []
}

function resolveTarget(targets: TargetInfo[], query: string): TargetInfo {
  const idx = Number(query)
  if (!Number.isNaN(idx) && idx >= 0 && idx < targets.length) {
    return targets[idx]
  }
  const match = targets.find((t) => t.url.includes(query) || t.title.includes(query))
  if (!match) throw new Error(`No target matching "${query}"`)
  return match
}

// ─── Session helpers ─────────────────────────────────────────────────

async function attachSession(
  cdp: CDPClient,
  targetId: string,
): Promise<string> {
  const result = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  const sessionId = result.sessionId as string
  if (!sessionId) throw new Error('attachToTarget returned no sessionId')
  return sessionId
}

async function enableDomains(
  cdp: CDPClient,
  sessionId: string,
  domains: string[],
): Promise<void> {
  for (const domain of domains) {
    await cdp.send(`${domain}.enable`, {}, sessionId)
  }
}

async function detachSession(
  cdp: CDPClient,
  sessionId: string,
): Promise<void> {
  try {
    await cdp.send('Target.detachFromTarget', { sessionId })
  } catch {
    // already detached
  }
}

// ─── Snapshot: AX tree ───────────────────────────────────────────────

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'textarea', 'checkbox', 'radio',
  'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch',
  'slider', 'spinbutton', 'option', 'treeitem', 'listbox',
])

const SKIP_ROLES = new Set(['none', 'presentation', 'LineBreak', 'InlineTextBox'])

type AXValue = { type: string; value?: string | number | boolean }
type AXProperty = { name: string; value: AXValue }
type AXNode = {
  nodeId: string
  ignored?: boolean
  role?: AXValue
  name?: AXValue
  value?: AXValue
  properties?: AXProperty[]
  childIds?: string[]
  backendDOMNodeId?: number
}

function buildInteractiveTree(nodes: AXNode[]): string[] {
  const nodeMap = new Map<string, AXNode>()
  for (const node of nodes) nodeMap.set(node.nodeId, node)

  const lines: string[] = []

  function walk(nodeId: string): void {
    const node = nodeMap.get(nodeId)
    if (!node) return

    const role = node.ignored ? undefined : (node.role?.value as string | undefined)
    if (!role || SKIP_ROLES.has(role)) {
      if (node.childIds) for (const childId of node.childIds) walk(childId)
      return
    }

    if (INTERACTIVE_ROLES.has(role) && node.backendDOMNodeId !== undefined) {
      const name = typeof node.name?.value === 'string' ? node.name.value : ''
      const value = typeof node.value?.value === 'string' ? node.value.value : ''

      let line = `[${node.backendDOMNodeId}] ${role}`
      if (name) line += ` "${name}"`
      if (value && (role === 'textbox' || role === 'searchbox' || role === 'textarea'))
        line += ` value="${value}"`
      const props = extractProps(node)
      if (props) line += ` ${props}`
      lines.push(line)
    }

    if (node.childIds) for (const childId of node.childIds) walk(childId)
  }

  const root =
    nodes.find((n) => n.role?.value === 'RootWebArea' || n.role?.value === 'WebArea') ??
    nodes[0]
  if (root?.childIds) for (const childId of root.childIds) walk(childId)

  return lines
}

function extractProps(node: AXNode): string {
  const parts: string[] = []
  if (!node.properties) return ''
  for (const prop of node.properties) {
    if (prop.name === 'checked' && prop.value.value === true) parts.push('checked')
    if (prop.name === 'checked' && prop.value.value === 'mixed') parts.push('indeterminate')
    if (prop.name === 'disabled' && prop.value.value === true) parts.push('disabled')
    if (prop.name === 'expanded' && prop.value.value === true) parts.push('expanded')
    if (prop.name === 'expanded' && prop.value.value === false) parts.push('collapsed')
    if (prop.name === 'required' && prop.value.value === true) parts.push('required')
    if (prop.name === 'selected' && prop.value.value === true) parts.push('selected')
    if (prop.name === 'level') parts.push(`level=${prop.value.value}`)
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : ''
}

// ─── Element center: 3-tier fallback ─────────────────────────────────

function quadCenter(q: number[]): { x: number; y: number } {
  const x = ((q[0] ?? 0) + (q[2] ?? 0) + (q[4] ?? 0) + (q[6] ?? 0)) / 4
  const y = ((q[1] ?? 0) + (q[3] ?? 0) + (q[5] ?? 0) + (q[7] ?? 0)) / 4
  return { x, y }
}

async function getElementCenter(
  cdp: CDPClient,
  sessionId: string,
  backendNodeId: number,
): Promise<{ x: number; y: number }> {
  // Tier 1: DOM.getContentQuads
  try {
    const quadsResult = await cdp.send(
      'DOM.getContentQuads',
      { backendNodeId },
      sessionId,
    )
    const quads = quadsResult.quads as number[][] | undefined
    if (quads?.length) {
      const q = quads[0]
      if (q && q.length >= 8) return quadCenter(q)
    }
  } catch {
    // fall through
  }

  // Tier 2: DOM.getBoxModel
  try {
    const boxResult = await cdp.send(
      'DOM.getBoxModel',
      { backendNodeId },
      sessionId,
    )
    const model = boxResult.model as { content?: number[] } | undefined
    const content = model?.content
    if (content && content.length >= 8) return quadCenter(content)
  } catch {
    // fall through
  }

  // Tier 3: getBoundingClientRect via JS
  const resolved = await cdp.send(
    'DOM.resolveNode',
    { backendNodeId },
    sessionId,
  )
  const obj = resolved.object as { objectId?: string } | undefined
  const objectId = obj?.objectId
  if (!objectId)
    throw new Error('Could not resolve element - it may have been removed from the page.')

  const boundsResult = await cdp.send(
    'Runtime.callFunctionOn',
    {
      functionDeclaration:
        'function(){var r=this.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height}}',
      objectId,
      returnByValue: true,
    },
    sessionId,
  )

  const result = boundsResult.result as { value?: { x: number; y: number; w: number; h: number } } | undefined
  const rect = result?.value
  if (!rect) throw new Error('Could not get element bounds.')
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

// ─── Commands ────────────────────────────────────────────────────────

async function cmdTargets(cdp: CDPClient): Promise<void> {
  const targets = await getTargets(cdp)
  if (targets.length === 0) {
    console.log('No targets found.')
    return
  }
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const isExtension = t.url.startsWith('chrome-extension://')
    const marker = isExtension ? ' [EXTENSION]' : ''
    console.log(`  ${i}  [${t.type}]  ${t.title || '(untitled)'}${marker}`)
    console.log(`     ${t.url}`)
  }
}

async function cmdScreenshot(
  cdp: CDPClient,
  targetQuery: string,
  outputPath: string,
): Promise<void> {
  const targets = await getTargets(cdp)
  const target = resolveTarget(targets, targetQuery)
  const sessionId = await attachSession(cdp, target.targetId)
  try {
    await enableDomains(cdp, sessionId, ['Page'])
    const result = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
    const data = result.data as string
    if (!data) throw new Error('No screenshot data returned')
    const buf = Buffer.from(data, 'base64')
    await Bun.write(outputPath, buf)
    console.log(`Screenshot saved to ${outputPath} (${buf.length} bytes)`)
  } finally {
    await detachSession(cdp, sessionId)
  }
}

async function cmdSnapshot(cdp: CDPClient, targetQuery: string): Promise<void> {
  const targets = await getTargets(cdp)
  const target = resolveTarget(targets, targetQuery)
  const sessionId = await attachSession(cdp, target.targetId)
  try {
    await enableDomains(cdp, sessionId, ['Accessibility'])
    const result = await cdp.send('Accessibility.getFullAXTree', {}, sessionId)
    const nodes = (result.nodes as AXNode[]) ?? []
    if (nodes.length === 0) {
      console.log('Empty accessibility tree.')
      return
    }
    const lines = buildInteractiveTree(nodes)
    if (lines.length === 0) {
      console.log('No interactive elements found.')
      return
    }
    console.log(lines.join('\n'))
  } finally {
    await detachSession(cdp, sessionId)
  }
}

async function cmdClick(
  cdp: CDPClient,
  targetQuery: string,
  elementId: number,
): Promise<void> {
  const targets = await getTargets(cdp)
  const target = resolveTarget(targets, targetQuery)
  const sessionId = await attachSession(cdp, target.targetId)
  try {
    await enableDomains(cdp, sessionId, ['DOM', 'Runtime', 'Input'])

    // Scroll into view first
    try {
      await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: elementId }, sessionId)
    } catch {
      // not critical
    }

    let clicked = false
    try {
      const { x, y } = await getElementCenter(cdp, sessionId, elementId)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId)
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x, y, button: 'left', clickCount: 1 },
        sessionId,
      )
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 },
        sessionId,
      )
      clicked = true
      console.log(`Clicked element ${elementId} at (${Math.round(x)}, ${Math.round(y)})`)
    } catch (err) {
      console.log(`Coordinate click failed (${(err as Error).message}), falling back to JS click`)
    }

    if (!clicked) {
      const resolved = await cdp.send(
        'DOM.resolveNode',
        { backendNodeId: elementId },
        sessionId,
      )
      const obj = resolved.object as { objectId?: string } | undefined
      const objectId = obj?.objectId
      if (!objectId) throw new Error('Element not found in DOM. Take a new snapshot.')
      await cdp.send(
        'Runtime.callFunctionOn',
        { functionDeclaration: 'function(){this.click()}', objectId },
        sessionId,
      )
      console.log(`JS-clicked element ${elementId}`)
    }
  } finally {
    await detachSession(cdp, sessionId)
  }
}

async function cmdFill(
  cdp: CDPClient,
  targetQuery: string,
  elementId: number,
  text: string,
): Promise<void> {
  const targets = await getTargets(cdp)
  const target = resolveTarget(targets, targetQuery)
  const sessionId = await attachSession(cdp, target.targetId)
  try {
    await enableDomains(cdp, sessionId, ['DOM', 'Runtime', 'Input'])

    // Scroll into view
    try {
      await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: elementId }, sessionId)
    } catch {
      // not critical
    }

    // Focus: pushNodesByBackendIdsToFrontend -> DOM.focus
    const pushResult = await cdp.send(
      'DOM.pushNodesByBackendIdsToFrontend',
      { backendNodeIds: [elementId] },
      sessionId,
    )
    const nodeIds = pushResult.nodeIds as number[] | undefined
    if (!nodeIds?.length) throw new Error('Could not push node to frontend')
    await cdp.send('DOM.focus', { nodeId: nodeIds[0] }, sessionId)

    // Clear: Ctrl+A (select all) then Delete
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 },
      sessionId,
    )
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 },
      sessionId,
    )
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
      sessionId,
    )
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
      sessionId,
    )

    // Type via insertText
    await cdp.send('Input.insertText', { text }, sessionId)

    console.log(`Filled element ${elementId} with "${text}"`)
  } finally {
    await detachSession(cdp, sessionId)
  }
}

async function cmdEval(
  cdp: CDPClient,
  targetQuery: string,
  expression: string,
): Promise<void> {
  const targets = await getTargets(cdp)
  const target = resolveTarget(targets, targetQuery)
  const sessionId = await attachSession(cdp, target.targetId)
  try {
    await enableDomains(cdp, sessionId, ['Runtime'])
    const result = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    const evalResult = result.result as {
      type?: string
      value?: unknown
      description?: string
      subtype?: string
    } | undefined
    const exnDetails = result.exceptionDetails as {
      exception?: { description?: string }
    } | undefined
    if (exnDetails) {
      console.error('Exception:', exnDetails.exception?.description ?? 'unknown error')
      process.exit(1)
    }
    if (evalResult?.type === 'undefined') {
      console.log('undefined')
    } else if (evalResult?.value !== undefined) {
      console.log(JSON.stringify(evalResult.value, null, 2))
    } else {
      console.log(evalResult?.description ?? evalResult?.type ?? 'null')
    }
  } finally {
    await detachSession(cdp, sessionId)
  }
}

async function cmdOpenSidepanel(cdp: CDPClient): Promise<void> {
  const targets = await getTargets(cdp)
  const sw = targets.find(
    (t) =>
      t.type === 'service_worker' &&
      t.url.includes(EXTENSION_ID),
  )
  if (!sw) {
    throw new Error(
      `No service worker found for extension ${EXTENSION_ID}. ` +
        'Is the BrowserOS agent extension installed and active?',
    )
  }

  const sessionId = await attachSession(cdp, sw.targetId)
  try {
    await enableDomains(cdp, sessionId, ['Runtime'])
    const result = await cdp.send(
      'Runtime.evaluate',
      {
        expression: 'chrome.sidePanel.open({})',
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    )
    const exnDetails = result.exceptionDetails as {
      exception?: { description?: string }
    } | undefined
    if (exnDetails) {
      throw new Error(
        `sidePanel.open() failed: ${exnDetails.exception?.description ?? 'unknown error'}`,
      )
    }
    console.log('Side panel opened.')
  } finally {
    await detachSession(cdp, sessionId)
  }
}

// ─── Help ────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`Usage: bun scripts/dev/inspect-ui.ts <command> [args...]

Commands:
  targets                              List all CDP targets (tabs + extensions)
  screenshot <target> [output.png]     Capture screenshot from target
  snapshot <target>                     Print interactive elements with [backendDOMNodeId]
  click <target> <elementId>           Click element by backendDOMNodeId
  fill <target> <elementId> <text>     Focus, clear, and type into element
  eval <target> <expression>           Evaluate JS in target context
  open-sidepanel                       Open the BrowserOS agent side panel

Target resolution:
  <target> can be a numeric index from 'targets' output, or a URL/title substring.

Environment:
  BROWSEROS_CDP_PORT   CDP port (default: ${DEFAULT_CDP_PORT})

Examples:
  bun scripts/dev/inspect-ui.ts targets
  bun scripts/dev/inspect-ui.ts screenshot 0 page.png
  bun scripts/dev/inspect-ui.ts snapshot google.com
  bun scripts/dev/inspect-ui.ts click 0 42
  bun scripts/dev/inspect-ui.ts fill 0 42 "hello world"
  bun scripts/dev/inspect-ui.ts eval 0 "document.title"
  bun scripts/dev/inspect-ui.ts open-sidepanel`)
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    process.exit(0)
  }

  const command = args[0]
  const port = Number(process.env.BROWSEROS_CDP_PORT) || DEFAULT_CDP_PORT
  const cdp = await CDPClient.connect(port)

  try {
    switch (command) {
      case 'targets':
        await cmdTargets(cdp)
        break

      case 'screenshot': {
        const target = args[1]
        if (!target) {
          console.error('Usage: screenshot <target> [output.png]')
          process.exit(1)
        }
        const output = args[2] ?? 'screenshot.png'
        await cmdScreenshot(cdp, target, output)
        break
      }

      case 'snapshot': {
        const target = args[1]
        if (!target) {
          console.error('Usage: snapshot <target>')
          process.exit(1)
        }
        await cmdSnapshot(cdp, target)
        break
      }

      case 'click': {
        const target = args[1]
        const elementIdStr = args[2]
        if (!target || !elementIdStr) {
          console.error('Usage: click <target> <elementId>')
          process.exit(1)
        }
        const elementId = Number(elementIdStr)
        if (Number.isNaN(elementId)) {
          console.error(`Invalid elementId: ${elementIdStr}`)
          process.exit(1)
        }
        await cmdClick(cdp, target, elementId)
        break
      }

      case 'fill': {
        const target = args[1]
        const elementIdStr = args[2]
        const text = args.slice(3).join(' ')
        if (!target || !elementIdStr || !text) {
          console.error('Usage: fill <target> <elementId> <text>')
          process.exit(1)
        }
        const elementId = Number(elementIdStr)
        if (Number.isNaN(elementId)) {
          console.error(`Invalid elementId: ${elementIdStr}`)
          process.exit(1)
        }
        await cmdFill(cdp, target, elementId, text)
        break
      }

      case 'eval': {
        const target = args[1]
        const expression = args.slice(2).join(' ')
        if (!target || !expression) {
          console.error('Usage: eval <target> <expression>')
          process.exit(1)
        }
        await cmdEval(cdp, target, expression)
        break
      }

      case 'open-sidepanel':
        await cmdOpenSidepanel(cdp)
        break

      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } finally {
    cdp.close()
  }
}

main().catch((err) => {
  console.error((err as Error).message)
  process.exit(1)
})
