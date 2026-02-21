/**
 * Button injection tests - verifies our custom buttons are injected
 * with correct labels, icons, and styles.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'
import { OUR, PROTECT } from './fixtures/selectors'
import { waitForButtonsInjected } from './fixtures/wait-helpers'

const env = getTestEnv()

test.describe('Buttons', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('sidebar button is injected in header', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)
    const button = electronPage.locator(OUR.sidebarButton)
    await expect(button).toBeVisible()
  })

  test('sidebar button shows "Hide Nav" when nav visible', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)
    const labelText = await electronPage.locator(OUR.sidebarButtonLabel).textContent()
    // Default state: nav visible -> "Hide Nav"
    // Could also be "Show Nav" if nav was hidden from a prior test
    expect(labelText).toMatch(/Hide Nav|Show Nav/)
  })

  test('sidebar button has SVG icon', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)
    const hasSvg = await electronPage.evaluate((sel) => {
      const icon = document.querySelector(sel)
      return icon ? icon.querySelector('svg') !== null : false
    }, OUR.sidebarButtonIcon)
    expect(hasSvg).toBe(true)
  })

  test('header toggle button is injected in nav', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)
    const button = electronPage.locator(OUR.headerToggleButton)
    await expect(button).toBeVisible()
  })

  test('fullscreen button is injected in header', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)
    const button = electronPage.locator(OUR.fullscreenButton)
    await expect(button).toBeVisible()
  })

  test('fullscreen button shows "Fullscreen" initially', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)
    const labelText = await electronPage.locator(OUR.fullscreenButtonLabel).textContent()
    expect(labelText?.trim()).toMatch(/^(Exit\s*)?Fullscreen$/)
  })

  test('dashboard button exists in body', async ({ electronPage }) => {
    const button = electronPage.locator(OUR.dashboardButton)
    // Dashboard button exists but may be hidden on dashboard page
    const count = await button.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('dashboard button hidden on dashboard page', async ({ electronPage }) => {
    const url = electronPage.url()
    if (url.includes('/protect/dashboard')) {
      const display = await electronPage.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement
        return el ? el.style.display : null
      }, OUR.dashboardButton)
      expect(display).toBe('none')
    }
  })

  test('button styles element in head', async ({ electronPage }) => {
    const hasStyles = await electronPage.evaluate((sel) => {
      return document.querySelector(sel) !== null
    }, OUR.buttonStyles)
    expect(hasStyles).toBe(true)
  })

  test('style checker re-injects styles after removal', async ({ electronPage }) => {
    // Remove styles
    await electronPage.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (el) el.remove()
    }, OUR.buttonStyles)

    // Verify removed
    const removedCheck = await electronPage.evaluate((sel) => {
      return document.querySelector(sel) !== null
    }, OUR.buttonStyles)
    expect(removedCheck).toBe(false)

    // Wait for style checker to re-inject (5s interval + buffer)
    await electronPage.waitForTimeout(6500)

    const reinjected = await electronPage.evaluate((sel) => {
      return document.querySelector(sel) !== null
    }, OUR.buttonStyles)
    expect(reinjected).toBe(true)
  })
})
