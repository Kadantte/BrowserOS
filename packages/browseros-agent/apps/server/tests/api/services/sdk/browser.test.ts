import { describe, expect, it } from 'bun:test'
import { BrowserService } from '../../../../src/api/services/sdk/browser'

describe('BrowserService.navigate', () => {
  it('throws when a window-targeted navigation cannot create or find any page', async () => {
    const browser = {
      listPages: async () => [],
      getActivePage: async () => null,
      newPage: async () => {
        throw new Error('Window not found')
      },
      goto: async () => {},
    }

    const service = new BrowserService(browser as never)

    await expect(
      service.navigate('https://example.com', undefined, 12345),
    ).rejects.toThrow('Window not found')
  })
})
