/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Service - Direct browser operations for SDK
 */

import type { Browser } from '../../../browser/browser'
import type {
  ActiveTab,
  InteractiveElements,
  NavigateResult,
  PageLoadStatus,
  Screenshot,
} from './types'
import { SdkError } from './types'

export class BrowserService {
  constructor(private browser: Browser) {}

  private async getFallbackPage() {
    const activePage = await this.browser.getActivePage()
    if (activePage) {
      return activePage
    }

    const pages = await this.browser.listPages()
    return pages.find((page) => !page.isHidden) ?? pages[0] ?? null
  }

  private async getPageInfo(pageId: number) {
    const pages = await this.browser.listPages()
    const page = pages.find((candidate) => candidate.pageId === pageId)
    if (!page) {
      throw new SdkError(`Page ${pageId} not found`, 404)
    }
    return page
  }

  private async getPageIdForTab(tabId: number): Promise<number> {
    const resolved = await this.browser.resolveTabIds([tabId])
    const pageId = resolved.get(tabId)
    if (pageId === undefined) {
      throw new SdkError(`Tab ${tabId} not found`, 404)
    }
    return pageId
  }

  async getActiveTab(windowId?: number): Promise<ActiveTab> {
    if (windowId !== undefined) {
      // Find the active tab in the specified window
      const pages = await this.browser.listPages()
      const page =
        pages.find((p) => p.windowId === windowId && p.isActive) ??
        (await this.getFallbackPage())
      if (!page) {
        throw new SdkError('No active tab found in specified window')
      }
      return {
        tabId: page.tabId,
        url: page.url,
        title: page.title,
        windowId: page.windowId ?? 0,
      }
    }

    const page = await this.getFallbackPage()
    if (!page) {
      throw new SdkError('No active tab found')
    }

    return {
      tabId: page.tabId,
      url: page.url,
      title: page.title,
      windowId: page.windowId ?? 0,
    }
  }

  async getPageContent(tabId: number): Promise<string> {
    const pageId = await this.getPageIdForTab(tabId)
    const content = await this.browser.contentAsMarkdown(pageId, {})
    if (!content) {
      throw new SdkError('No content found on page', 400)
    }
    return content
  }

  async getScreenshot(tabId: number): Promise<Screenshot> {
    const pageId = await this.getPageIdForTab(tabId)
    return await this.browser.screenshot(pageId, {
      format: 'png',
      fullPage: false,
    })
  }

  async navigate(
    url: string,
    tabId?: number,
    windowId?: number,
  ): Promise<NavigateResult> {
    if (tabId !== undefined) {
      const pages = await this.browser.listPages()
      const page = pages.find((p) => p.tabId === tabId)
      if (!page) {
        throw new SdkError(`Tab ${tabId} not found`, 404)
      }
      await this.browser.goto(page.pageId, url)
      return { tabId, windowId: page.windowId ?? 0 }
    }

    if (windowId !== undefined) {
      const pages = await this.browser.listPages()
      const page = pages.find((p) => p.windowId === windowId && p.isActive)
      if (page) {
        await this.browser.goto(page.pageId, url)
        return { tabId: page.tabId, windowId }
      }

      try {
        const pageId = await this.browser.newPage(url, { windowId })
        const createdPage = await this.getPageInfo(pageId)
        return {
          tabId: createdPage.tabId,
          windowId: createdPage.windowId ?? windowId,
        }
      } catch (error) {
        const fallbackPage = await this.getFallbackPage()
        if (fallbackPage) {
          await this.browser.goto(fallbackPage.pageId, url)
          return {
            tabId: fallbackPage.tabId,
            windowId: fallbackPage.windowId ?? 0,
          }
        }
        throw error instanceof SdkError
          ? error
          : new SdkError(
              error instanceof Error
                ? error.message
                : 'Failed to navigate in specified window',
            )
      }
    }

    const activePage = await this.getFallbackPage()
    if (activePage) {
      await this.browser.goto(activePage.pageId, url)
      return {
        tabId: activePage.tabId,
        windowId: activePage.windowId ?? 0,
      }
    }

    const pageId = await this.browser.newPage(url)
    const createdPage = await this.getPageInfo(pageId)
    return {
      tabId: createdPage.tabId,
      windowId: createdPage.windowId ?? 0,
    }
  }

  async getPageLoadStatus(tabId: number): Promise<PageLoadStatus> {
    const pages = await this.browser.listPages()
    const page = pages.find((p) => p.tabId === tabId)
    if (!page) {
      throw new SdkError('Tab not found', 404)
    }
    return {
      tabId: page.tabId,
      isDOMContentLoaded: !page.isLoading,
      isResourcesLoading: page.isLoading,
      isPageComplete: !page.isLoading,
    }
  }

  async getInteractiveElements(
    tabId: number,
    simplified = false,
    _windowId?: number,
  ): Promise<InteractiveElements> {
    const pageId = await this.getPageIdForTab(tabId)
    const content = simplified
      ? await this.browser.snapshot(pageId)
      : await this.browser.enhancedSnapshot(pageId)
    return { content }
  }
}
