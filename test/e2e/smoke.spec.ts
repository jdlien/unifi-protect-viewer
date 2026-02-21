/**
 * Smoke tests - basic app launch and API verification.
 * No credentials needed, uses fresh-app fixture (launches with --reset).
 */

import { test, expect } from './fixtures/fresh-app'

test.describe('Smoke tests', () => {
  test('app launches and creates a window', async ({ electronApp }) => {
    // firstWindow() waits until a window is available
    const window = await electronApp.firstWindow()
    expect(window).toBeTruthy()
  })

  test('window title contains "UniFi Protect Viewer"', async ({ electronPage }) => {
    // Wait for config page to load (fresh start goes to config)
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    const title = await electronPage.title()
    expect(title).toContain('UniFi Protect Viewer')
  })

  test('electronAPI is exposed via preload', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    const hasElectronAPI = await electronPage.evaluate(() => {
      return typeof window.electronAPI === 'object' && window.electronAPI !== null
    })
    expect(hasElectronAPI).toBe(true)
  })

  test('electronAPI has expected method groups', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    const apiKeys = await electronPage.evaluate(() => {
      if (!window.electronAPI) return []
      return Object.keys(window.electronAPI)
    })

    expect(apiKeys).toContain('config')
    expect(apiKeys).toContain('app')
    expect(apiKeys).toContain('navigation')
    expect(apiKeys).toContain('ui')
    expect(apiKeys).toContain('updates')
    expect(apiKeys).toContain('timeouts')
  })

  test('getAppVersion returns a semver string', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    const version = await electronPage.evaluate(async () => {
      return await window.electronAPI.getAppVersion()
    })

    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('window loads config page on fresh start', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    const url = electronPage.url()
    expect(url).toContain('config.html')
  })

  test('app responds to --reset flag (config is empty)', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    // After --reset, url field should be empty
    const urlValue = await electronPage.inputValue('#url')
    expect(urlValue).toBe('')
  })
})
