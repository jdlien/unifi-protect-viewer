# Code Review & Cleanup — Audit & Remediation

**Date:** 2026-02-21
**Codebase:** UniFi Protect Viewer v2.0.x
**Total source lines:** ~4,139 (18 JS files)

---

## Completed Work (P1 + P2)

All 13 items from the original audit plan were completed across two sessions on 2026-02-21.

### P1 — Quick wins (5 items)

1. **Inline dashboard SVG** — Replaced `fs.readFileSync` in `buttons.js` with an inline SVG constant, eliminating `fs`/`path` imports from renderer
2. **Fix `isDashboardPage()` IPC side effect** — Made the function pure; moved IPC notification to `navigation.js` URL change handler
3. **Extract widget panel toggle** — Deduplicated toggle logic from `preload.js` into `ui.js:toggleWidgetPanel()`
4. **Deduplicate button injection** — `initializeProtectPage()` now calls `ensureButtonsInjected()` instead of repeating inject/register
5. **Split `updates.js`** — Separated 806-line dual-process module into `updates-main.js` (main process) and `updates.js` (renderer-only)

### P2 — Code quality + testing (8 items)

6. **`constants.js`** — Extracted magic numbers into named constants across all modules
7. **Standardize auth.js logging** — Replaced `console.*` with `utils.log`/`utils.logError`/`utils.logWarn`
8. **Simplify `navigation.js`** — Collapsed multiple init paths into single `initializeCurrentPage()` + `setupNavigationMonitor()`
9. **Vitest + happy-dom** — Set up test framework with electron/electron-updater/electron-store mocks in `test/setup.js`
10. **Unit tests: utils + timeouts** — 27 tests covering `waitUntil`, `setStyle`, `clickElement`, logging, timeout tracking
11. **Unit tests: uiController** — 28 tests covering all public API. Introduced **dependency injection** pattern (`initialize({ ipcRenderer })`) to solve Vitest 4.x CJS mocking limitation. Created `electron-ipc.js` bridge module as production fallback
12. **Playwright E2E setup** — Config + `@playwright/test` dependency, serial Electron worker
13. **E2E smoke tests** — 4 tests: app launch, window title, `electronAPI` exposed, API methods present

### Key architectural decisions during implementation

- **DI over module mocking**: Vitest 4.x `vi.mock()` cannot intercept CJS `require()`. Rather than fighting ESM/CJS interop, `uiController.initialize()` accepts `{ ipcRenderer }` directly. Clean, testable, no mocking gymnastics.
- **`electron-ipc.js` bridge**: Thin wrapper re-exporting `require('electron').ipcRenderer`. Serves as the production default when DI is not used.
- **`destroy()` full reset**: Fixed latent bug where `destroy()` didn't reset `navHidden`/`headerHidden`/`isFullscreen`/`toggleInProgress`.

### Test counts

| Suite            | Tests  | Duration |
| ---------------- | ------ | -------- |
| Unit (Vitest)    | 59     | ~400ms   |
| E2E (Playwright) | 4      | ~3s      |
| **Total**        | **63** |          |

---

## What's Working Well

These patterns should be preserved:

- **UIController as single source of truth** — owns all nav/header/fullscreen visibility state
- **One-way dependency flow** — `preload.js` → `uiController.js` → `utils.js`, `buttonStyles.js`
- **Dumb button views** — `buttons.js` does NOT import `uiController`; accepts callbacks, returns updaters
- **Clean main process entry point** — `main.js` is ~71 lines of orchestration
- **Strong Electron security** — `@electron/fuses`, `contextIsolation: true`, no `nodeIntegration`
- **Multi-platform CI/CD** — macOS signing/notarization, Windows Azure Trusted Signing, Linux
- **DI for testability** — `uiController.initialize({ ipcRenderer })` enables clean unit testing

---

## Wrapper App Boundaries

### In scope

- Custom buttons, nav/header visibility, our CSS, camera tile dispatching, widget panel, login form filling, window management, menus, hotkeys, auto-update

### Out of scope

- Protect's internal styling (except our overrides), React component state (read-only fiber access), Protect's router, Protect's WebSocket/API

### Fragile Protect selectors

Documented in CLAUDE.md. Will break on Protect updates.

---

## P3 + Future Tasks

| #   | Item                                                           | Effort | Risk   | Notes                                                      |
| --- | -------------------------------------------------------------- | ------ | ------ | ---------------------------------------------------------- |
| 14  | Expand unit test coverage (buttons.js, auth.js, cameras.js)    | Medium | Low    | Use DI pattern established in uiController                 |
| 15  | Full E2E test suite (nav toggle, camera hotkeys, widget panel) | Large  | Low    | Needs mock Protect HTML fixtures                           |
| 16  | Move CSS-in-JS to external stylesheets                         | Medium | Low    | `buttonStyles.js` (158 lines CSS), update notification CSS |
| 17  | Replace style checker polling with MutationObserver            | Small  | Low    | Body observer may already cover this                       |
| 18  | Audit and trim unused exports from `buttons.js`                | Small  | Low    | Several internal-only functions are exported               |
| 19  | Extract `mainWorldBridge()` helper for fiber access            | Small  | Low    | Reusable pattern for `contextIsolation` bridging           |
| 20  | Add ESLint                                                     | Medium | N/A    | Complement prettier with code quality rules                |
| 21  | TypeScript migration                                           | Large  | Medium | See `.taskmaster/tasks/tasks.json` task #3 for subtasks    |
| 22  | Add CI unit test job                                           | Small  | Low    | Add `pnpm test` step to `.github/workflows/ci.yml`         |
| 23  | Configuration menu item                                        | Small  | Low    | See `.taskmaster/tasks/tasks.json` task #1                 |
