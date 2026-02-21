const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: 'list',
})
