import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: 'list',
  expect: {
    timeout: 10_000,
  },
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: 'smoke.spec.ts',
      timeout: 30_000,
    },
    {
      name: 'config',
      testMatch: 'config-page.spec.ts',
      timeout: 30_000,
    },
    {
      name: 'live',
      testMatch: [
        'login-flow.spec.ts',
        'dashboard.spec.ts',
        'buttons.spec.ts',
        'navigation.spec.ts',
        'widget-panel.spec.ts',
        'menu.spec.ts',
        'fullscreen.spec.ts',
      ],
      timeout: 120_000,
    },
    {
      name: 'fragile',
      testMatch: 'cameras.spec.ts',
      timeout: 120_000,
    },
  ],
})
