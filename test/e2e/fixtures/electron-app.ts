/**
 * Shared session fixture for live E2E tests.
 * Launches once, logs in once, reuses the same page across all tests.
 *
 * Uses a module-level singleton so Playwright's workers:1 keeps
 * the same Electron process alive across test files.
 */

import { test as base, _electron as electron, type ElectronApplication, type Page, expect } from '@playwright/test'
import * as path from 'node:path'
import { getTestEnv } from './env'
import { waitForDashboardReady, waitForButtonsInjected } from './wait-helpers'

// Module-level singleton
let sharedApp: ElectronApplication | null = null
let sharedPage: Page | null = null
let loginComplete = false

async function ensureAppReady(): Promise<{ app: ElectronApplication; page: Page }> {
  if (sharedApp && sharedPage) {
    // Recovery check: verify page is still alive and on dashboard
    try {
      const url = sharedPage.url()
      if (!url.includes('/protect/')) {
        // Navigate back to dashboard
        const env = getTestEnv()
        if (env) {
          const dashboardUrl = env.url.replace(/\/$/, '') + '/dashboard'
          await sharedPage.goto(dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          await waitForDashboardReady(sharedPage, 60_000)
        }
      }
    } catch {
      // Page crashed, need to relaunch
      sharedApp = null
      sharedPage = null
      loginComplete = false
    }
  }

  if (sharedApp && sharedPage) {
    return { app: sharedApp, page: sharedPage }
  }

  const env = getTestEnv()
  if (!env) {
    throw new Error('Cannot launch shared app without test environment variables')
  }

  // Launch with --reset for clean state
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../../'), '--reset'],
  })

  const page = await app.firstWindow()

  // Wait for config page
  await page.waitForURL(/config\.html/, { timeout: 15_000 })
  await page.waitForLoadState('load')

  // Fill config form and connect
  await page.fill('#url', env.url)
  await page.fill('#username', env.username)
  await page.fill('#password', env.password)
  await page.click('#connectBtn')

  // Wait for login to complete and dashboard to load
  await page.waitForURL(/\/protect\//, { timeout: 60_000 })

  // Wait for dashboard elements
  await waitForDashboardReady(page, 90_000)

  // Wait for our buttons to be injected
  try {
    await waitForButtonsInjected(page, 30_000)
  } catch {
    // Buttons may not inject on first load; continue
  }

  sharedApp = app
  sharedPage = page
  loginComplete = true

  return { app, page }
}

type LiveFixtures = {
  electronApp: ElectronApplication
  electronPage: Page
}

export const test = base.extend<LiveFixtures>({
  electronApp: async ({}, use) => {
    const { app } = await ensureAppReady()
    await use(app)
    // Do NOT close — shared across tests
  },

  electronPage: async ({}, use) => {
    const { page } = await ensureAppReady()
    await use(page)
  },
})

export { expect }

// Clean up on process exit
process.on('beforeExit', async () => {
  if (sharedApp) {
    await sharedApp.close().catch(() => {})
    sharedApp = null
    sharedPage = null
  }
})
