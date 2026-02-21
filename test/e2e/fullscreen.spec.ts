/**
 * Fullscreen tests - button click, programmatic toggle, label updates.
 *
 * Uses electronApp.evaluate to toggle fullscreen from the main process
 * since Playwright's keyboard.press doesn't reliably trigger Electron
 * menu accelerators like F11.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'
import { OUR } from './fixtures/selectors'
import { waitForButtonsInjected } from './fixtures/wait-helpers'

const env = getTestEnv()

test.describe('Fullscreen', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('fullscreen button click toggles fullscreen', async ({ electronApp, electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialFullscreen = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win?.isFullScreen() ?? false
    })

    await electronPage.click(OUR.fullscreenButton)
    await electronPage.waitForTimeout(1500)

    const afterClick = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win?.isFullScreen() ?? false
    })
    expect(afterClick).toBe(!initialFullscreen)

    // RESTORE
    await electronPage.click(OUR.fullscreenButton)
    await electronPage.waitForTimeout(1500)

    const restored = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win?.isFullScreen() ?? false
    })
    expect(restored).toBe(initialFullscreen)
  })

  test('programmatic fullscreen toggle works', async ({ electronApp, electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialFullscreen = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win?.isFullScreen() ?? false
    })

    // Toggle fullscreen via main process
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setFullScreen(!win.isFullScreen())
    })
    await electronPage.waitForTimeout(1500)

    const afterToggle = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win?.isFullScreen() ?? false
    })
    expect(afterToggle).toBe(!initialFullscreen)

    // RESTORE
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setFullScreen(!win.isFullScreen())
    })
    await electronPage.waitForTimeout(1500)
  })

  test('button label changes in fullscreen', async ({ electronApp, electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    // Enter fullscreen
    await electronPage.click(OUR.fullscreenButton)
    await electronPage.waitForTimeout(1500)

    const labelInFullscreen = await electronPage.locator(OUR.fullscreenButtonLabel).textContent()
    expect(labelInFullscreen).toContain('Exit')

    // RESTORE
    await electronPage.click(OUR.fullscreenButton)
    await electronPage.waitForTimeout(1500)

    const labelAfterExit = await electronPage.locator(OUR.fullscreenButtonLabel).textContent()
    expect(labelAfterExit?.trim()).toBe('Fullscreen')
  })

  test('exiting fullscreen restores label', async ({ electronApp, electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialLabel = await electronPage.locator(OUR.fullscreenButtonLabel).textContent()

    // Enter and exit via main process
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setFullScreen(true)
    })
    await electronPage.waitForTimeout(1500)

    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setFullScreen(false)
    })
    await electronPage.waitForTimeout(1500)

    const restoredLabel = await electronPage.locator(OUR.fullscreenButtonLabel).textContent()
    expect(restoredLabel).toBe(initialLabel)
  })
})
