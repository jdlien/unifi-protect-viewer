/**
 * Per-test Electron app fixture for smoke and config tests.
 * Launches with --reset flag, closes after each test.
 * No login or credentials needed.
 */

import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'node:path'

type FreshAppFixtures = {
  electronApp: ElectronApplication
  electronPage: Page
}

export const test = base.extend<FreshAppFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../../../'), '--reset'],
    })
    await use(app)
    await app.close()
  },

  electronPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    // Wait for config page to finish loading before handing to test
    await page.waitForURL(/config\.html/, { timeout: 15_000 })
    await page.waitForLoadState('load')
    await use(page)
  },
})

export { expect } from '@playwright/test'
