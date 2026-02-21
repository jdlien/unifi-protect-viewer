/**
 * Dashboard tests - readiness, CSS customizations, camera detection.
 * Uses shared session fixture.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'
import { PROTECT, OUR } from './fixtures/selectors'

const env = getTestEnv()

test.describe('Dashboard', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('dashboard page URL is correct', async ({ electronPage }) => {
    const url = electronPage.url()
    expect(url).toContain('/protect/dashboard')
  })

  test('FullscreenWrapper element exists', async ({ electronPage }) => {
    const wrapper = electronPage.locator(PROTECT.fullscreenWrapper)
    await expect(wrapper.first()).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard content element exists', async ({ electronPage }) => {
    const content = electronPage.locator(PROTECT.dashboardContent)
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })

  test('body background is black', async ({ electronPage }) => {
    const bg = await electronPage.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor
    })
    // Could be 'black', 'rgb(0, 0, 0)', or similar
    expect(bg === 'black' || bg === 'rgb(0, 0, 0)').toBe(true)
  })

  test('dashboard content has zero gap', async ({ electronPage }) => {
    const gap = await electronPage.evaluate((sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).gap : null
    }, PROTECT.dashboardContent)

    // gap should be '0px' or 'normal' (which is equivalent to 0 for grid/flex)
    if (gap) {
      expect(gap === '0px' || gap === 'normal' || gap === '0').toBeTruthy()
    }
  })

  test('dashboard content has zero padding', async ({ electronPage }) => {
    const padding = await electronPage.evaluate((sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).padding : null
    }, PROTECT.dashboardContent)

    if (padding) {
      expect(padding === '0px' || padding === '0').toBeTruthy()
    }
  })

  test('FullscreenWrapper has black background', async ({ electronPage }) => {
    const bg = await electronPage.evaluate((sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).backgroundColor : null
    }, PROTECT.fullscreenWrapper)

    if (bg) {
      expect(bg === 'black' || bg === 'rgb(0, 0, 0)').toBe(true)
    }
  })

  test('button styles element injected in head', async ({ electronPage }) => {
    const hasStyles = await electronPage.evaluate((sel) => {
      return document.querySelector(sel) !== null
    }, OUR.buttonStyles)
    expect(hasStyles).toBe(true)
  })

  test('at least one camera tile detected', async ({ electronPage }) => {
    const count = await electronPage.evaluate((sel) => {
      return document.querySelectorAll(sel).length
    }, PROTECT.cameraViewport)
    expect(count).toBeGreaterThan(0)
  })
})
