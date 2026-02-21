/**
 * Config page tests - form validation, save/load, diagnostics.
 * No credentials needed, uses fresh-app fixture.
 */

import { test, expect } from './fixtures/fresh-app'
import { OUR } from './fixtures/selectors'

test.describe('Config page', () => {
  test('config form elements are present', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    await expect(electronPage.locator(OUR.configUrl)).toBeVisible()
    await expect(electronPage.locator(OUR.configUsername)).toBeVisible()
    await expect(electronPage.locator(OUR.configPassword)).toBeVisible()
    await expect(electronPage.locator(OUR.configConnectBtn)).toBeVisible()
  })

  test('validates empty fields on submit', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    // Clear any pre-filled values
    await electronPage.fill(OUR.configUrl, '')
    await electronPage.fill(OUR.configUsername, '')
    await electronPage.fill(OUR.configPassword, '')

    await electronPage.click(OUR.configConnectBtn)

    // Error div should become visible
    const errorDiv = electronPage.locator(OUR.configError)
    await expect(errorDiv).toBeVisible()
    const errorText = await errorDiv.textContent()
    expect(errorText).toContain('URL is required')
    expect(errorText).toContain('Username is required')
    expect(errorText).toContain('Password is required')
  })

  test('validates invalid URL format', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    await electronPage.fill(OUR.configUrl, 'not-a-valid-url')
    await electronPage.fill(OUR.configUsername, 'user')
    await electronPage.fill(OUR.configPassword, 'pass')

    await electronPage.click(OUR.configConnectBtn)

    const errorDiv = electronPage.locator(OUR.configError)
    await expect(errorDiv).toBeVisible()
    const errorText = await errorDiv.textContent()
    expect(errorText).toContain('Invalid URL')
  })

  test('auto-appends trailing slash to URL', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    await electronPage.fill(OUR.configUrl, 'https://192.168.1.1/protect')

    // Call the page's validateForm() directly to trigger slash append
    // without submitting the form (which would navigate away)
    const urlValue = await electronPage.evaluate(() => {
      ;(window as any).validateForm()
      return (document.getElementById('url') as HTMLInputElement).value
    })

    expect(urlValue).toBe('https://192.168.1.1/protect/')
  })

  test('ignoreCertErrors checkbox is present and unchecked by default', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    const checkbox = electronPage.locator(OUR.configIgnoreCert)
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()
  })

  test('diagnostics section loads', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    const diagnostics = electronPage.locator(OUR.diagnosticsSection)
    await expect(diagnostics).toBeVisible()

    // Wait for diagnostics to populate (replaces "Loading diagnostics...")
    await electronPage.waitForFunction(
      () => {
        const body = document.getElementById('diagnosticsBody')
        return body && !body.textContent?.includes('Loading diagnostics')
      },
      { timeout: 10_000 },
    )

    const bodyText = await electronPage.locator(OUR.diagnosticsBody).textContent()
    expect(bodyText).toContain('Platform')
    expect(bodyText).toContain('Electron')
    expect(bodyText).toContain('App Version')
  })

  test('hotkey label matches platform', async ({ electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    const hotkeyText = await electronPage.locator(OUR.configHotkey).textContent()
    const isMac = process.platform === 'darwin'
    if (isMac) {
      expect(hotkeyText).toContain('\u2318+,')
    } else {
      expect(hotkeyText).toContain('Ctrl+,')
    }
  })

  test('connect button disables during connection attempt', async ({ electronApp, electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    // Intercept navigation at the main process level to prevent page close
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const origLoadURL = win.loadURL.bind(win)
      win.loadURL = (url: string, options?: any) => {
        // Block navigation to external URLs, allow file:// (config page)
        if (url.startsWith('https://') || url.startsWith('http://')) return Promise.resolve()
        return origLoadURL(url, options)
      }
    })

    await electronPage.fill(OUR.configUrl, 'https://192.168.1.1/protect/')
    await electronPage.fill(OUR.configUsername, 'user')
    await electronPage.fill(OUR.configPassword, 'pass')

    await electronPage.click(OUR.configConnectBtn)
    await electronPage.waitForTimeout(500)

    // Button should be disabled after clicking
    const isDisabled = await electronPage.locator(OUR.configConnectBtn).isDisabled()
    expect(isDisabled).toBe(true)
  })

  test('status message updates on save', async ({ electronApp, electronPage }) => {
    await electronPage.waitForURL(/config\.html/, { timeout: 15_000 })
    await electronPage.waitForLoadState('load')

    // Intercept navigation at the main process level
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const origLoadURL = win.loadURL.bind(win)
      win.loadURL = (url: string, options?: any) => {
        if (url.startsWith('https://') || url.startsWith('http://')) return Promise.resolve()
        return origLoadURL(url, options)
      }
    })

    await electronPage.fill(OUR.configUrl, 'https://192.168.1.1/protect/')
    await electronPage.fill(OUR.configUsername, 'user')
    await electronPage.fill(OUR.configPassword, 'pass')

    await electronPage.click(OUR.configConnectBtn)
    await electronPage.waitForTimeout(500)

    // Status should update to show connecting message
    const statusText = await electronPage.locator(OUR.configStatus).textContent()
    expect(statusText).toContain('Connecting')
  })
})
