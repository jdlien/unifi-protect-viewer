/**
 * Reusable wait strategies for E2E tests.
 * Timeouts align with values in src/ts/modules/constants.ts.
 */

import type { Page } from '@playwright/test'
import { PROTECT, OUR } from './selectors'

/** Wait for both FullscreenWrapper and Content to appear (dashboard ready) */
export async function waitForDashboardReady(page: Page, timeout = 60_000): Promise<void> {
  await Promise.all([
    page.waitForSelector(PROTECT.fullscreenWrapper, { timeout }),
    page.waitForSelector(PROTECT.dashboardContent, { timeout }),
  ])
}

/** Wait for our injected buttons to appear */
export async function waitForButtonsInjected(page: Page, timeout = 30_000): Promise<void> {
  await Promise.all([
    page.waitForSelector(OUR.sidebarButton, { timeout }),
    page.waitForSelector(OUR.fullscreenButton, { timeout }),
    page.waitForSelector(OUR.headerToggleButton, { timeout }),
  ])
}

/** Wait for at least one camera tile to appear */
export async function waitForCameras(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForSelector(PROTECT.cameraViewport, { timeout })
}

/**
 * Wait for enforcement burst to settle.
 * 10 ticks x 300ms = 3000ms + 500ms buffer = 3500ms
 */
export async function waitForEnforcementSettle(page: Page): Promise<void> {
  await page.waitForTimeout(3500)
}

/**
 * Wait for widget panel CSS transition.
 * 350ms transition + 150ms buffer = 500ms
 */
export async function waitForWidgetTransition(page: Page): Promise<void> {
  await page.waitForTimeout(500)
}

/** Wait for config page to load */
export async function waitForConfigPage(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForURL(/config\.html/, { timeout })
  await page.waitForLoadState('load')
}

/** Wait for any Protect page to load */
export async function waitForProtectPage(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForURL(/\/protect\//, { timeout })
}
