const { test, expect } = require('@playwright/test')
const { _electron: electron } = require('playwright')
const path = require('node:path')

let app

test.afterEach(async () => {
  if (app) {
    await app.close()
    app = null
  }
})

test('app launches and creates a window', async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../main.js'), '--reset'],
  })

  const window = await app.firstWindow()
  expect(window).toBeTruthy()
})

test('window has correct title', async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../main.js'), '--reset'],
  })

  const window = await app.firstWindow()
  const title = await window.title()
  expect(title).toContain('UniFi Protect Viewer')
})

test('electronAPI is exposed via preload', async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../main.js'), '--reset'],
  })

  const window = await app.firstWindow()
  // App navigates from about:blank to config page — wait for final load
  await window.waitForURL(/config\.html/)
  await window.waitForLoadState('load')

  const hasElectronAPI = await window.evaluate(() => {
    return typeof window.electronAPI === 'object' && window.electronAPI !== null
  })
  expect(hasElectronAPI).toBe(true)
})

test('electronAPI exposes expected methods', async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../main.js'), '--reset'],
  })

  const window = await app.firstWindow()
  await window.waitForURL(/config\.html/)
  await window.waitForLoadState('load')

  const apiMethods = await window.evaluate(() => {
    if (!window.electronAPI) return []
    return Object.keys(window.electronAPI)
  })

  expect(apiMethods).toContain('getAppVersion')
})
