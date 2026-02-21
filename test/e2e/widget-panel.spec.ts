/**
 * Widget panel tests - expand button, toggle, opacity.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'
import { PROTECT } from './fixtures/selectors'
import { waitForWidgetTransition } from './fixtures/wait-helpers'

const env = getTestEnv()

test.describe('Widget panel', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('widget panel element exists', async ({ electronPage }) => {
    const exists = await electronPage.evaluate((sel) => {
      return document.querySelector(sel) !== null
    }, PROTECT.widgetPanel)
    expect(exists).toBe(true)
  })

  test('expand button exists', async ({ electronPage }) => {
    const exists = await electronPage.evaluate((sel) => {
      return document.querySelector(sel) !== null
    }, PROTECT.expandButton)
    expect(exists).toBe(true)
  })

  test('expand button has reduced opacity', async ({ electronPage }) => {
    const opacity = await electronPage.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLElement
      return btn ? getComputedStyle(btn).opacity : null
    }, PROTECT.expandButton)

    if (opacity) {
      expect(parseFloat(opacity)).toBeLessThanOrEqual(0.6)
    }
  })

  test('toggleWidgetPanel changes panel width', async ({ electronPage }) => {
    // Get initial width
    const initialWidth = await electronPage.evaluate((sel) => {
      const panel = document.querySelector(sel) as HTMLElement
      return panel ? parseFloat(getComputedStyle(panel).width) : 0
    }, PROTECT.widgetPanel)

    // Toggle via API (keyboard shortcuts don't reliably trigger Electron menu accelerators)
    await electronPage.evaluate(() => {
      window.electronAPI.ui.toggleWidgetPanel()
    })
    await waitForWidgetTransition(electronPage)

    // Get new width
    const toggledWidth = await electronPage.evaluate((sel) => {
      const panel = document.querySelector(sel) as HTMLElement
      return panel ? parseFloat(getComputedStyle(panel).width) : 0
    }, PROTECT.widgetPanel)

    // Width should have changed
    expect(toggledWidth).not.toBe(initialWidth)

    // RESTORE
    await electronPage.evaluate(() => {
      window.electronAPI.ui.toggleWidgetPanel()
    })
    await waitForWidgetTransition(electronPage)
  })
})
