import { describe, it, expect, vi } from 'vitest'

describe('Test framework smoke test', () => {
  it('runs in happy-dom environment', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })

  it('can create DOM elements', () => {
    const div = document.createElement('div')
    div.id = 'test'
    document.body.appendChild(div)
    expect(document.getElementById('test')).toBeTruthy()
    div.remove()
  })

  it('has electron mocked via import', async () => {
    const electron = await import('electron')
    expect(electron.ipcRenderer.send).toBeDefined()
    expect(electron.ipcRenderer.invoke).toBeDefined()
  })

  it('can load source modules that depend on electron', async () => {
    // This verifies the mock works with source modules that import electron
    const utils = await import('../../src/ts/modules/utils')
    expect(utils.log).toBeDefined()
    expect(utils.logError).toBeDefined()
    expect(utils.waitUntil).toBeDefined()
  })
})
