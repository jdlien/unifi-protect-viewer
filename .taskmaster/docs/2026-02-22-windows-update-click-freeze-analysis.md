# Windows Update Check Click-Freeze Analysis (v2.2.4)

Date: 2026-02-22
Repo: /Users/jdlien/code/unifi-protect-viewer
Version analyzed: v2.2.4 (`a14fd78`)

## Scope

This report analyzes the Windows-only click freeze after "Check for Updates", based on:

- changelog and git history around v2.2.4
- updater flow implementation in `src/ts/modules/updates-main.ts`
- known Electron modal/dialog behavior and issue history

## What changed in 2.2.4

From `CHANGELOG.md`, v2.2.4 states the Windows freeze was fixed by awaiting all `dialog.showMessageBox()` calls in the update flow.

Commit `06ff01e` does exactly that and adds a static unit test to enforce `await dialog.showMessageBox(...)`.

That fix addressed one real failure mode, but not the whole class of Windows modal lifecycle races.

## Key findings (ranked by likelihood)

### 1) Most likely root cause: modal `BrowserWindow.close()` is not awaited before opening the next parented dialog

In v2.2.4, helper functions close modal updater windows synchronously:

- `_closeCheckingDialog()` and `_closeDownloadDialog()` call `close()` and return immediately
- then `_manageUpdateUI('not-available')`, `_manageUpdateUI('available')`, `_manageUpdateUI('downloaded')`, and `_manageUpdateUI('error')` proceed to `dialog.showMessageBox(_mainWindow, ...)`

Relevant code in `a14fd78`:

- `src/ts/modules/updates-main.ts`: close helpers at lines ~155-167
- immediate follow-up modal message boxes at lines ~223, ~293, ~315, ~337

Why this is high confidence:

- Electron `dialog.showMessageBox(browserWindow, ...)` is modal when parented.
- Electron has long-running Windows bugs where parent windows can remain disabled/unusable when modal child lifecycle and close timing interleave badly.
- Issue evidence:
  - https://github.com/electron/electron/issues/45965
  - https://github.com/electron/electron/issues/8768

Symptom match is exact: mouse clicks (including window chrome) stop working while keyboard shortcuts may still work.

### 2) Likely contributing cause: re-entrant async UI flow with no serialization

`_manageUpdateUI(...)` is async, but many invocations are fire-and-forget in event handlers:

- `update-available`, `update-not-available`, `error`, `download-progress`, `update-downloaded` all call `_manageUpdateUI(...)` without `await`

Relevant code in `a14fd78`:

- `src/ts/modules/updates-main.ts`: lines ~366-400

This permits overlapping transitions and out-of-order modal operations against shared globals (`checkingDialog`, `downloadDialog`, `isManualCheckInProgress`), increasing the chance of parent enable/disable desync on Windows.

### 3) Likely contributing cause: `ready-to-show` callbacks use mutable globals instead of captured window refs

In v2.2.4:

- `checkingDialog.once('ready-to-show', () => checkingDialog!.show())`
- `downloadDialog.once('ready-to-show', () => downloadDialog!.show())`

Relevant code in `a14fd78`:

- `src/ts/modules/updates-main.ts`: lines ~205 and ~273

If dialog references change before callback execution, callbacks can target the wrong window or trigger repeated `show()` calls on a modal.

Electron has had Windows bugs specifically around modal parent disable accounting and repeated `show()` behavior:

- https://github.com/electron/electron/issues/48965
- https://github.com/electron/electron/pull/48977

### 4) Lower likelihood but real risk: unguarded multi-trigger manual checks

The manual check entrypoints do not hard-block a second trigger while one is in progress.

This can amplify races in findings #2 and #3.

## Why "await showMessageBox" alone was insufficient

Awaiting `showMessageBox` prevents one known bug class, but the updater flow still transitions between multiple parented modals without waiting for prior modal `BrowserWindow` destruction to complete.

On Windows, the fragile part is parent enable/disable state transitions across modal windows, not just awaiting one promise.

## Recommended solution path

### Immediate fixes (highest impact)

1. Make `_closeCheckingDialog()` and `_closeDownloadDialog()` async and resolve only on `'closed'`.
2. `await` those close helpers everywhere before any parented `showMessageBox`.
3. Add a safety net before opening a message box:
   - `if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setEnabled(true)`
4. Capture dialog references locally for `ready-to-show`:
   - avoid callbacks that dereference mutable globals.

### Hardening fixes (next)

1. Serialize `_manageUpdateUI` with a simple queue/mutex so transitions cannot overlap.
2. Disable "Check for Updates" menu item while manual check is active.
3. Normalize all `_manageUpdateUI('error', ...)` calls to pass `{ error }` consistently.

### Optional architecture simplification

Reduce modal layering on Windows:

- keep one updater child window and update its state instead of opening/closing multiple modal windows
- or use non-modal progress UI for "checking/downloading" and reserve native message box for final user decision only

## Validation plan

1. Run updater flow on Windows with no update available:
   - after dismissing "No Updates", verify click on app content and titlebar buttons.
2. Repeat rapid triggers:
   - click "Check for Updates" multiple times quickly.
3. Test error path:
   - force updater failure and dismiss error dialog; verify clicks still work.
4. Add a Windows E2E smoke test in CI that checks post-dialog clickability.

## Notes on current working tree

Current local uncommitted changes already move toward the right fix direction by:

- making close helpers async
- awaiting close calls in most transition points
- adding a main-window `setEnabled(true)` safety call

This aligns with the recommended approach in this report.

## External references

- Electron dialog API (modal behavior with parent window): https://www.electronjs.org/docs/latest/api/dialog
- Electron BrowserWindow API (modal windows): https://www.electronjs.org/docs/latest/api/browser-window
- Electron issue: modal hide/close can leave parent unusable (Windows): https://github.com/electron/electron/issues/45965
- Electron issue: parent remains disabled after modal `show()` patterns: https://github.com/electron/electron/issues/48965
- Electron PR with fix/backports for modal disable accounting: https://github.com/electron/electron/pull/48977
- Electron issue: historical parent disabled modal bug (Windows): https://github.com/electron/electron/issues/8768
- Electron 40.0.0 release notes (modal behavior fixes listed): https://releases.electronjs.org/release/v40.0.0
