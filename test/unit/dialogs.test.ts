import { describe, it, expect, vi, beforeEach } from 'vitest'
import Module from 'module'

// Mock for updates-main (lazy-required by showAboutDialog)
const mockUpdatesMain = { checkForUpdatesWithDialog: vi.fn().mockResolvedValue(undefined) }

// Intercept require('electron') and require('./updates-main') at the Node.js
// level so that CJS require() in source modules returns our mocks.
const originalResolveFilename = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }
  if (request === './updates-main') {
    // Return a key that we register in require.cache below
    return '__mock_updates_main__'
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Register the mock in require.cache so require('./updates-main') returns it
require.cache['__mock_updates_main__'] = {
  id: '__mock_updates_main__',
  filename: '__mock_updates_main__',
  loaded: true,
  exports: mockUpdatesMain,
} as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dialogs: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDialog: any

async function loadDialogs() {
  if (!dialogs) {
    const mod = await import('../../src/ts/modules/dialogs')
    dialogs = mod
  }
  return dialogs
}

function getMockDialog() {
  if (!mockDialog) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('../__mocks__/electron.ts')
    mockDialog = electron.dialog
  }
  return mockDialog
}

/** Create a deferred promise for controlling dialog resolution */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Minimal mock BrowserWindow */
const mockWindow = {} as Electron.BrowserWindow

describe('dialogs', () => {
  beforeEach(async () => {
    await loadDialogs()
    const dlg = getMockDialog()
    dlg.showMessageBox.mockReset()
    dlg.showMessageBox.mockResolvedValue({ response: 0 })
    // Reset guards between tests
    dialogs._resetDialogGuards()
  })

  describe('showResetConfirmation guard', () => {
    it('should only show one dialog when called concurrently', async () => {
      const dlg = getMockDialog()
      const { promise, resolve } = deferred<{ response: number }>()
      dlg.showMessageBox.mockReturnValueOnce(promise)

      // Call twice without awaiting the first
      const call1 = dialogs.showResetConfirmation(mockWindow)
      const call2 = dialogs.showResetConfirmation(mockWindow)

      // Second call should resolve immediately with false
      expect(await call2).toBe(false)

      // Resolve the first dialog
      resolve({ response: 1 })
      expect(await call1).toBe(true)

      // showMessageBox was called only once
      expect(dlg.showMessageBox).toHaveBeenCalledTimes(1)
    })

    it('should allow a new dialog after the first one resolves', async () => {
      const dlg = getMockDialog()
      dlg.showMessageBox.mockResolvedValue({ response: 0 })

      await dialogs.showResetConfirmation(mockWindow)
      await dialogs.showResetConfirmation(mockWindow)

      expect(dlg.showMessageBox).toHaveBeenCalledTimes(2)
    })

    it('should reset the guard even if showMessageBox rejects', async () => {
      const dlg = getMockDialog()
      dlg.showMessageBox.mockRejectedValueOnce(new Error('test error'))

      // First call — rejects internally, guard should still reset
      const result = await dialogs.showResetConfirmation(mockWindow)
      expect(result).toBe(false)

      // Second call should work normally
      dlg.showMessageBox.mockResolvedValue({ response: 1 })
      const result2 = await dialogs.showResetConfirmation(mockWindow)
      expect(result2).toBe(true)
      expect(dlg.showMessageBox).toHaveBeenCalledTimes(2)
    })
  })

  describe('showAboutDialog guard', () => {
    it('should only show one dialog when called concurrently', async () => {
      const dlg = getMockDialog()
      const { promise, resolve } = deferred<{ response: number }>()
      dlg.showMessageBox.mockReturnValueOnce(promise)

      const call1 = dialogs.showAboutDialog(mockWindow)
      const call2 = dialogs.showAboutDialog(mockWindow)

      // Second call should resolve immediately (void)
      await call2

      // Resolve the first dialog (Close button = 2)
      resolve({ response: 2 })
      await call1

      expect(dlg.showMessageBox).toHaveBeenCalledTimes(1)
    })

    it('should allow a new dialog after the first one resolves', async () => {
      const dlg = getMockDialog()
      dlg.showMessageBox.mockResolvedValue({ response: 2 })

      await dialogs.showAboutDialog(mockWindow)
      await dialogs.showAboutDialog(mockWindow)

      expect(dlg.showMessageBox).toHaveBeenCalledTimes(2)
    })
  })
})
