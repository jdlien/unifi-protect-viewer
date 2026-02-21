/**
 * Login flow tests - auto-login, credential filling, dashboard arrival.
 * Requires PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD env vars.
 */

import { test, expect } from './fixtures/electron-app'
import { getTestEnv } from './fixtures/env'

const env = getTestEnv()

test.describe('Login flow', () => {
  test.skip(!env, 'Skipping: PROTECT_URL/USERNAME/PASSWORD not set')

  test('app navigates to Protect URL after config', async ({ electronPage }) => {
    const url = electronPage.url()
    expect(url).toContain('/protect/')
  })

  test('auto-login reaches dashboard', async ({ electronPage }) => {
    const url = electronPage.url()
    expect(url).toContain('/protect/dashboard')
  })

  test('dashboard URL is correct', async ({ electronPage }) => {
    const url = electronPage.url()
    expect(url).toMatch(/\/protect\/dashboard/)
  })

  test('page is not on login page', async ({ electronPage }) => {
    const url = electronPage.url()
    expect(url).not.toContain('/login')
    expect(url).not.toContain('/signin')
  })
})
