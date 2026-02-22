/**
 * Tests for updates-main.ts and dialogs.ts — guards against the critical
 * Windows input freeze bug caused by modal dialog lifecycle issues.
 *
 * Background (Windows input freeze bug):
 * On Windows, two patterns cause the parent BrowserWindow to permanently
 * lose mouse input (keyboard accelerators still work via global menu):
 *
 * 1. Unawaited dialog.showMessageBox(): The returned Promise must always be
 *    awaited. Without await, the native modal dialog lifecycle desynchronizes
 *    from the parent window's input event loop.
 *
 * 2. Modal BrowserWindow close() race condition: BrowserWindow.close() is
 *    async on Windows — the parent is only re-enabled in the WM_NCDESTROY
 *    handler after DestroyWindow completes. If dialog.showMessageBox is called
 *    before the modal BrowserWindow is fully destroyed, Win32's enable/disable
 *    state gets permanently desynchronized.
 *    See: https://github.com/electron/electron/issues/45965
 *
 * The fix requires:
 * - Always `await` dialog.showMessageBox()
 * - Always `await` _closeCheckingDialog() / _closeDownloadDialog() before
 *   showing any subsequent dialog on the same parent window
 * - Call _ensureMainWindowEnabled() as a safety net before dialog.showMessageBox
 *
 * Note: A behavioral (runtime) test would require Vitest to intercept CJS
 * require('electron') calls, which Vitest 4.x does not support. The static
 * analysis approach below is more reliable as a regression guard.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const UPDATES_PATH = resolve(__dirname, '../../src/ts/modules/updates-main.ts')
const DIALOGS_PATH = resolve(__dirname, '../../src/ts/modules/dialogs.ts')

describe('updates-main', () => {
  const source = readFileSync(UPDATES_PATH, 'utf-8')

  describe('dialog.showMessageBox must always be awaited', () => {
    it('every dialog.showMessageBox() call has await to prevent Windows input freeze', () => {
      const allCalls = [...source.matchAll(/dialog\.showMessageBox\s*\(/g)]
      const awaitedCalls = [...source.matchAll(/await\s+dialog\.showMessageBox\s*\(/g)]

      expect(allCalls.length).toBeGreaterThan(0)

      // If this assertion fails, a dialog.showMessageBox() call was added without `await`.
      // On Windows, unawaited native modal dialogs permanently freeze mouse input
      // on the parent BrowserWindow. Always await dialog.showMessageBox().
      expect(awaitedCalls.length).toBe(allCalls.length)
    })

    it('has the expected number of dialog.showMessageBox() calls', () => {
      // Track the total count so we notice if calls are added or removed.
      // Update this number when legitimately adding/removing dialog calls.
      const allCalls = [...source.matchAll(/dialog\.showMessageBox\s*\(/g)]
      expect(allCalls.length).toBe(7)
    })
  })

  describe('modal BrowserWindow close helpers must be awaited before showing dialogs', () => {
    it('every _closeCheckingDialog() call is awaited', () => {
      // Match calls but not the function definition (which has (): Promise<void>)
      const allCalls = [...source.matchAll(/(?<!function )_closeCheckingDialog\(\)/g)]
      const awaitedCalls = [...source.matchAll(/await\s+_closeCheckingDialog\(\)/g)]

      expect(allCalls.length).toBeGreaterThan(0)
      // If this fails, a _closeCheckingDialog() call was added without `await`.
      // On Windows, BrowserWindow.close() is async — the parent is only re-enabled
      // in the WM_NCDESTROY handler. Proceeding without waiting causes the parent
      // to get stuck in a disabled state, freezing mouse input permanently.
      expect(awaitedCalls.length).toBe(allCalls.length)
    })

    it('every _closeDownloadDialog() call is awaited', () => {
      const allCalls = [...source.matchAll(/(?<!function )_closeDownloadDialog\(\)/g)]
      const awaitedCalls = [...source.matchAll(/await\s+_closeDownloadDialog\(\)/g)]

      expect(allCalls.length).toBeGreaterThan(0)
      expect(awaitedCalls.length).toBe(allCalls.length)
    })

    it('_closeCheckingDialog returns a Promise (async close with closed event)', () => {
      // The close helper must wait for the 'closed' event before resolving
      expect(source).toContain("checkingDialog.once('closed'")
      expect(source).toMatch(/function _closeCheckingDialog\(\): Promise<void>/)
    })

    it('_closeDownloadDialog returns a Promise (async close with closed event)', () => {
      expect(source).toContain("downloadDialog.once('closed'")
      expect(source).toMatch(/function _closeDownloadDialog\(\): Promise<void>/)
    })
  })

  describe('queue serialization guards against re-entrant UI transitions', () => {
    it('has a _uiQueue promise chain at module level', () => {
      expect(source).toMatch(/let\s+_uiQueue\s*:\s*Promise<void>\s*=\s*Promise\.resolve\(\)/)
    })

    it('_manageUpdateUI chains non-progress steps through _uiQueue', () => {
      // The queue wrapper must chain transitions through _uiQueue to prevent
      // overlapping modal operations that desync Win32 enable/disable state
      expect(source).toMatch(/_uiQueue\.then\(\s*\(\)\s*=>\s*_manageUpdateUIImpl\(/)
    })

    it('progress bypasses the queue for real-time responsiveness', () => {
      // Progress updates are lightweight and time-sensitive — they must not
      // wait for heavy modal transitions to complete
      expect(source).toMatch(/function\s+_handleProgress\(/)
    })
  })

  describe('local ref capture prevents ready-to-show mutable global race', () => {
    it('ready-to-show callbacks do not use checkingDialog!/downloadDialog! globals directly', () => {
      // The global reference could be reassigned between BrowserWindow creation
      // and the ready-to-show callback firing, causing show() on the wrong window
      const readyToShowCallbacks = [...source.matchAll(/once\('ready-to-show'[\s\S]*?\}\)/g)]
      expect(readyToShowCallbacks.length).toBeGreaterThan(0)

      for (const match of readyToShowCallbacks) {
        expect(match[0]).not.toContain('checkingDialog!')
        expect(match[0]).not.toContain('downloadDialog!')
      }
    })

    it('ready-to-show callbacks include isDestroyed() guard', () => {
      const readyToShowBlocks = [...source.matchAll(/once\('ready-to-show'[\s\S]*?\}\)/g)]
      expect(readyToShowBlocks.length).toBeGreaterThan(0)
      for (const match of readyToShowBlocks) {
        expect(match[0]).toContain('isDestroyed()')
      }
    })
  })

  describe('error data shape consistency', () => {
    it('every error step call passes { error: ... } shape', () => {
      // All _manageUpdateUI('error', ...) and _manageUpdateUIImpl('error', ...)
      // calls must pass { error: ... } object — bare errors lose the message
      const lines = source.split('\n')
      const errorCallLines = lines.filter(
        (line) => /_manageUpdateUI(?:Impl)?\(\s*'error'/.test(line) && !line.trim().startsWith('//'),
      )
      expect(errorCallLines.length).toBeGreaterThan(0)

      for (const line of errorCallLines) {
        expect(line).toMatch(/\{\s*error\s*:/)
      }
    })
  })

  describe('internal calls within _manageUpdateUIImpl bypass the queue', () => {
    // Extract the _manageUpdateUIImpl function body by counting braces
    function getImplBody(): string {
      const funcSignature = 'async function _manageUpdateUIImpl('
      const implStart = source.indexOf(funcSignature)
      expect(implStart).toBeGreaterThan(-1)

      let braceCount = 0
      let started = false
      let bodyEnd = implStart
      for (let i = implStart; i < source.length; i++) {
        if (source[i] === '{') {
          started = true
          braceCount++
        } else if (source[i] === '}') {
          braceCount--
        }
        if (started && braceCount === 0) {
          bodyEnd = i
          break
        }
      }
      return source.slice(implStart + funcSignature.length, bodyEnd)
    }

    it('does not call the queue wrapper _manageUpdateUI() from inside the impl (would deadlock)', () => {
      const implBody = getImplBody()
      // _manageUpdateUI( without Impl suffix would re-enter the queue and deadlock
      const nonImplCalls = [...implBody.matchAll(/_manageUpdateUI(?!Impl)\s*\(/g)]
      expect(nonImplCalls.length).toBe(0)
    })

    it('all recursive _manageUpdateUIImpl() calls within the impl are awaited', () => {
      const implBody = getImplBody()
      const allImplCalls = [...implBody.matchAll(/_manageUpdateUIImpl\s*\(/g)]
      const awaitedImplCalls = [...implBody.matchAll(/await\s+_manageUpdateUIImpl\s*\(/g)]
      expect(allImplCalls.length).toBeGreaterThan(0)
      expect(awaitedImplCalls.length).toBe(allImplCalls.length)
    })
  })
})

describe('dialogs', () => {
  const source = readFileSync(DIALOGS_PATH, 'utf-8')

  it('every dialog.showMessageBox() call is awaited', () => {
    const allCalls = [...source.matchAll(/dialog\.showMessageBox\s*\(/g)]
    const awaitedCalls = [...source.matchAll(/await\s+dialog\.showMessageBox\s*\(/g)]

    expect(allCalls.length).toBeGreaterThan(0)
    expect(awaitedCalls.length).toBe(allCalls.length)
  })
})
