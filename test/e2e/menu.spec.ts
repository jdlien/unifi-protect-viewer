/**
 * Menu tests - structure, configuration item state, camera menu.
 * Uses Electron's evaluate to inspect the application menu.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'

const env = getTestEnv()

test.describe('Menu', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('menu has expected top-level items', async ({ electronApp }) => {
    const menuLabels = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return []
      return menu.items.map((item) => item.label)
    })

    expect(menuLabels).toContain('File')
    expect(menuLabels).toContain('Edit')
    expect(menuLabels).toContain('View')
    expect(menuLabels).toContain('Cameras')
    expect(menuLabels).toContain('Help')
  })

  test('View menu has navigation toggle items', async ({ electronApp }) => {
    const viewMenuLabels = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return []
      const viewMenu = menu.items.find((item) => item.label === 'View')
      if (!viewMenu?.submenu) return []
      return viewMenu.submenu.items.map((item) => item.label)
    })

    // Should have toggle items (exact labels depend on state)
    const hasNavToggle = viewMenuLabels.some(
      (label) => label.includes('Navigation') || label.includes('Side Navigation'),
    )
    const hasHeaderToggle = viewMenuLabels.some((label) => label.includes('Header'))
    const hasWidgetToggle = viewMenuLabels.some((label) => label.includes('Widget Panel'))

    expect(hasNavToggle).toBe(true)
    expect(hasHeaderToggle).toBe(true)
    expect(hasWidgetToggle).toBe(true)
  })

  test('Cameras menu lists detected cameras', async ({ electronApp }) => {
    const cameraMenuLabels = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return []
      const cameraMenu = menu.items.find((item) => item.label === 'Cameras')
      if (!cameraMenu?.submenu) return []
      return cameraMenu.submenu.items.map((item) => item.label)
    })

    // Should have at least one camera or "No cameras" message
    expect(cameraMenuLabels.length).toBeGreaterThan(0)
  })

  test('Configuration item enabled on protect page', async ({ electronApp }) => {
    const configEnabled = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return null
      const fileMenu = menu.items.find((item) => item.label === 'File')
      if (!fileMenu?.submenu) return null
      const configItem = fileMenu.submenu.items.find((item) => item.label === 'Configuration')
      return configItem?.enabled ?? null
    })

    // On a protect page, Configuration should be enabled
    expect(configEnabled).toBe(true)
  })

  test('View menu has fullscreen items', async ({ electronApp }) => {
    const viewMenuLabels = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return []
      const viewMenu = menu.items.find((item) => item.label === 'View')
      if (!viewMenu?.submenu) return []
      return viewMenu.submenu.items.map((item) => item.label)
    })

    const hasFullscreen = viewMenuLabels.some((label) => label.includes('Fullscreen'))
    expect(hasFullscreen).toBe(true)
  })

  test('View menu has Return to Dashboard item', async ({ electronApp }) => {
    const viewMenuLabels = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return []
      const viewMenu = menu.items.find((item) => item.label === 'View')
      if (!viewMenu?.submenu) return []
      return viewMenu.submenu.items.map((item) => item.label)
    })

    expect(viewMenuLabels).toContain('Return to Dashboard')
  })
})
