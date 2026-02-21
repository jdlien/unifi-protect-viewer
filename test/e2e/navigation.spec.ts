/**
 * Navigation toggle tests - toggleAll/toggleNav/toggleHeader,
 * enforcement, state persistence.
 *
 * Uses the electronAPI.ui methods instead of keyboard shortcuts
 * because Playwright's keyboard.press doesn't reliably trigger
 * Electron menu accelerators.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'
import { waitForEnforcementSettle, waitForButtonsInjected } from './fixtures/wait-helpers'
import { OUR } from './fixtures/selectors'

const env = getTestEnv()

test.describe('Navigation toggles', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('toggleAll hides both nav and header, then restores', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    // Get initial state
    const initialNavDisplay = await electronPage.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).display : 'none'
    })

    // Toggle all to hide
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleAll()
    })
    await waitForEnforcementSettle(electronPage)

    if (initialNavDisplay !== 'none') {
      const navDisplay = await electronPage.evaluate(() => {
        const nav = document.querySelector('nav')
        return nav ? getComputedStyle(nav).display : null
      })
      expect(navDisplay).toBe('none')

      const headerDisplay = await electronPage.evaluate(() => {
        const header = document.querySelector('header')
        return header ? getComputedStyle(header).display : null
      })
      expect(headerDisplay).toBe('none')
    }

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleAll()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('toggleNav affects sidebar only (header unaffected)', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialHeaderDisplay = await electronPage.evaluate(() => {
      const header = document.querySelector('header')
      return header ? getComputedStyle(header).display : null
    })

    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleNavOnly()
    })
    await waitForEnforcementSettle(electronPage)

    // Header should be unaffected
    const headerDisplay = await electronPage.evaluate(() => {
      const header = document.querySelector('header')
      return header ? getComputedStyle(header).display : null
    })
    expect(headerDisplay).toBe(initialHeaderDisplay)

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleNavOnly()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('toggleHeader affects header only (nav unaffected)', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialNavDisplay = await electronPage.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).display : null
    })

    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleHeaderOnly()
    })
    await waitForEnforcementSettle(electronPage)

    // Nav should be unaffected
    const navDisplay = await electronPage.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).display : null
    })
    expect(navDisplay).toBe(initialNavDisplay)

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleHeaderOnly()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('nav enforcement corrects external DOM changes', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    // Hide all via toggleAll
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleAll()
    })
    await waitForEnforcementSettle(electronPage)

    // Externally set nav to visible (simulating Protect re-showing it)
    await electronPage.evaluate(() => {
      const nav = document.querySelector('nav') as HTMLElement
      if (nav) nav.style.display = 'flex'
    })

    // Wait for MutationObserver to correct it
    await electronPage.waitForTimeout(500)

    const navDisplay = await electronPage.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).display : null
    })
    expect(navDisplay).toBe('none')

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleAll()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('sidebar button label updates on toggle', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialLabel = await electronPage.locator(OUR.sidebarButtonLabel).textContent()

    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleNavOnly()
    })
    await waitForEnforcementSettle(electronPage)

    const toggledLabel = await electronPage.locator(OUR.sidebarButtonLabel).textContent()
    expect(toggledLabel).not.toBe(initialLabel)

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleNavOnly()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('header toggle button icon updates on toggle', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    const initialHtml = await electronPage.evaluate((sel) => {
      const btn = document.querySelector(sel)
      return btn ? btn.innerHTML : ''
    }, OUR.headerToggleButton)

    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleHeaderOnly()
    })
    await waitForEnforcementSettle(electronPage)

    const toggledHtml = await electronPage.evaluate((sel) => {
      const btn = document.querySelector(sel)
      return btn ? btn.innerHTML : ''
    }, OUR.headerToggleButton)

    expect(toggledHtml).not.toBe(initialHtml)

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleHeaderOnly()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('UI state persisted to config after toggle', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    // Get initial state
    const initialConfig = await electronPage.evaluate(async () => {
      return await window.electronAPI.config.load()
    })
    const initialHideNav = (initialConfig as Record<string, unknown>)?.hideNav

    // Toggle nav
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleNavOnly()
    })
    await waitForEnforcementSettle(electronPage)

    // Check config was saved
    const config = await electronPage.evaluate(async () => {
      return await window.electronAPI.config.load()
    })
    const hideNav = (config as Record<string, unknown>)?.hideNav

    expect(hideNav).not.toBe(initialHideNav)

    // RESTORE
    await electronPage.evaluate(async () => {
      await window.electronAPI.ui.toggleNavOnly()
    })
    await waitForEnforcementSettle(electronPage)
  })

  test('state survives page reload', async ({ electronPage }) => {
    await waitForButtonsInjected(electronPage, 30_000)

    // Get current nav state
    const navHiddenBefore = await electronPage.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).display === 'none' : null
    })

    // Reload the page
    await electronPage.reload({ waitUntil: 'domcontentloaded' })

    // Wait for buttons to re-inject after reload
    await waitForButtonsInjected(electronPage, 30_000)
    await waitForEnforcementSettle(electronPage)

    // Check state survived
    const navHiddenAfter = await electronPage.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).display === 'none' : null
    })

    expect(navHiddenAfter).toBe(navHiddenBefore)
  })
})
