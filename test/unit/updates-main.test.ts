/**
 * Tests for updates-main.ts — guards against the critical requirement that
 * dialog.showMessageBox() calls are always awaited.
 *
 * Background (Windows input freeze bug):
 * On Windows, calling Electron's dialog.showMessageBox() without awaiting
 * the returned Promise causes the parent window's input event loop to
 * desynchronize from the native modal dialog lifecycle. After the dialog is
 * dismissed, the parent BrowserWindow permanently loses all mouse input.
 * Keyboard accelerators still work because they bypass the window message pump.
 *
 * This was originally caused by 5 unawaited dialog.showMessageBox() calls in
 * the update flow ('not-available', 'error', dev-mode checks, simulation).
 * The fix is to always `await` the returned Promise.
 *
 * Note: A behavioral (runtime) test for this would require Vitest to intercept
 * CJS require('electron') calls inside the module, which Vitest 4.x does not
 * support. The static analysis approach below is more reliable as a regression
 * guard — it directly verifies the code pattern regardless of platform or
 * mock infrastructure.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE_PATH = resolve(__dirname, '../../src/ts/modules/updates-main.ts')

describe('updates-main', () => {
  describe('dialog.showMessageBox must always be awaited', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8')

    it('every dialog.showMessageBox() call has await to prevent Windows input freeze', () => {
      const allCalls = [...source.matchAll(/dialog\.showMessageBox\s*\(/g)]
      const awaitedCalls = [...source.matchAll(/await\s+dialog\.showMessageBox\s*\(/g)]

      expect(allCalls.length).toBeGreaterThan(0)

      // If this assertion fails, a dialog.showMessageBox() call was added without `await`.
      // On Windows, unawaited native modal dialogs permanently freeze mouse input
      // on the parent BrowserWindow. Always await dialog.showMessageBox().
      // See: https://github.com/electron/electron/issues/... (Electron modal dialog lifecycle)
      expect(awaitedCalls.length).toBe(allCalls.length)
    })

    it('has the expected number of dialog.showMessageBox() calls', () => {
      // Track the total count so we notice if calls are added or removed.
      // Update this number when legitimately adding/removing dialog calls.
      const allCalls = [...source.matchAll(/dialog\.showMessageBox\s*\(/g)]
      expect(allCalls.length).toBe(7)
    })
  })
})
