import { describe, it } from 'bun:test'
import assert from 'node:assert'
import type { ProtocolApi } from '@browseros/cdp-protocol/protocol-api'
import { Browser } from '../../src/browser/browser'

function createBrowserWithEvaluationValues(values: boolean[]): Browser {
  const browser = Object.create(Browser.prototype) as Browser
  const session = {
    Runtime: {
      evaluate: async () => ({
        result: { value: values.shift() ?? false },
      }),
    },
  } as unknown as ProtocolApi

  Object.defineProperty(browser, 'resolveSession', {
    value: async () => session,
  })

  return browser
}

describe('Browser.waitFor', () => {
  it('does not treat text that never existed as gone', async () => {
    const browser = createBrowserWithEvaluationValues([false, false, false])

    const found = await browser.waitFor(1, {
      textGone: 'Loading',
      timeout: 10,
    })

    assert.strictEqual(found, false)
  })

  it('resolves textGone after the text appears and then disappears', async () => {
    const browser = createBrowserWithEvaluationValues([true, false])

    const found = await browser.waitFor(1, {
      textGone: 'Loading',
      timeout: 600,
    })

    assert.strictEqual(found, true)
  })

  it('does not treat a selector that never existed as gone', async () => {
    const browser = createBrowserWithEvaluationValues([false, false, false])

    const found = await browser.waitFor(1, {
      selectorGone: '.spinner',
      timeout: 10,
    })

    assert.strictEqual(found, false)
  })

  it('resolves selectorGone after the selector appears and then disappears', async () => {
    const browser = createBrowserWithEvaluationValues([true, false])

    const found = await browser.waitFor(1, {
      selectorGone: '.spinner',
      timeout: 600,
    })

    assert.strictEqual(found, true)
  })
})
