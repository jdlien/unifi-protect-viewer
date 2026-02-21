# Code Review & Cleanup — Audit Findings and Remediation Plan

**Date:** 2026-02-21
**Codebase:** UniFi Protect Viewer v2.0.x
**Total source lines:** ~4,139 (18 JS files)

---

## A. What's Working Well

These patterns should be preserved and built upon:

- **UIController as single source of truth** — `src/js/modules/uiController.js` owns all nav/header/fullscreen visibility state. No duplicate state, no conflicting sources.
- **One-way dependency flow** — `preload.js` -> `uiController.js` -> `utils.js`, `buttonStyles.js`. Clean and predictable.
- **Dumb button views** — `buttons.js` does NOT import `uiController`. Buttons accept `onClick` callbacks and return updater functions. State flows down, events flow up.
- **Clean main process entry point** — `main.js` is 71 lines of clear orchestration: store init, window creation, IPC setup, updates, menu.
- **Strong Electron security hardening** — `@electron/fuses` in `scripts/afterPack.js`, `contextIsolation: true`, no `nodeIntegration` in renderer.
- **Multi-platform CI/CD** — GitHub Actions with macOS signing/notarization, Windows Azure Trusted Signing, Linux builds.
- **Keep a Changelog format** — `CHANGELOG.md` with semantic versioning.
- **Idempotent button injection** — Safe for SPA navigation; `ensureButtonsInjected()` checks DOM before re-injecting.

---

## B. Architectural Issues & Proposed Fixes

### B1. `updates.js` — Dual-process module (806 lines)

**File:** `src/js/modules/updates.js`

**Problem:** Single file serves both main and renderer processes with completely different code paths. Main process code (lines 19-552): auto-updater setup, modal BrowserWindow dialogs, IPC handlers, update scheduling. Renderer process code (lines 554-793): notification DOM elements, CSS injection, progress bar. Module-level globals (`_mainWindow`, `checkingDialog`, `downloadDialog`, `isManualCheckInProgress`) create implicit state. Both `preload.js` (renderer) and `main.js` (main process) import the same file.

**Proposal:** Split into:
- `updates-main.js` — `setupAutoUpdater()`, `setupUpdateIpcHandlers()`, `initialize()`, `checkForUpdatesWithDialog()`, `_manageUpdateUI()`, `getAutoUpdater()`, dialog management
- `updates-renderer.js` — `initializeUpdateListeners()`, `showUpdateNotification()`, `removeUpdateNotification()`, `updateDownloadProgress()`, `addUpdateStyles()`
- `src/css/update-notification.css` — Extract the 75 lines of CSS from `addUpdateStyles()`

**Risk:** Medium. Cross-process module with shared exports; split errors can break startup, IPC wiring, or update UX. Requires verifying all import sites (`main.js` line 6, `preload.js` lines 13-18) and testing both manual + automatic update flows.

### B2. `buttons.js` — `fs.readFileSync` in renderer (line 271)

**File:** `src/js/modules/buttons.js:268-275`

**Problem:** `injectDashboardButton()` reads `src/img/dashboard-icon.svg` synchronously from disk in the renderer process. Blocks the main thread and introduces unnecessary I/O. Other icons in the same file are already inline string constants.

**Proposal:** Read the SVG file once and inline it as a string constant (like `navIcons`, `headerToggleIcons`, and `fullscreenIcons` already are). This eliminates the `fs` and `path` imports from the renderer module entirely.

### B3. `cameras.js` — React fiber tree inspection (lines 208-253)

**File:** `src/js/modules/cameras.js:208-253`

**Problem:** `getCurrentZoomIndex()` injects a `<script>` element to read React's `__reactFiber$` internals from the main world, working around `contextIsolation`. This is inherently fragile — React internal key names can change between versions, and the fiber tree depth/structure varies.

**Proposal:** This is a necessary evil for now — there's no other way to read Protect's zoom state from an isolated preload context. Remediation:
1. Document it as a known fragility with version-specific comments
2. Extract the bridge pattern into a reusable `mainWorldBridge(scriptBody)` helper so the injection/cleanup/read pattern isn't duplicated if we need it again
3. Add a comment listing the specific React internals we depend on: `__reactFiber$`, `__reactInternalInstance$`, `memoizedProps.zoomedSlotIdx`

### B4. `navigation.js` — Multiple initialization paths and retry loops

**File:** `src/js/modules/navigation.js`

**Problem:**
- `initializePageByType()` (line 106) calls `setupNavigationMonitor()` on 3 of 4 branches (lines 110, 113, 117) — redundant setup
- `initializeWithPolling()` (line 124) uses `requestAnimationFrame` polling that retries `initializePageByType()` repeatedly, each call potentially creating a new navigation monitor
- `setupNavigationMonitor()` contains its own `applyDashboardCustomizations()` retry loop with `setTimeout` (line 48)
- Result: overlapping retry mechanisms that can fire in unpredictable order

**Proposal:** Simplify to a single initialization path:
1. `initializeWithPolling()` calls `setupNavigationMonitor()` once (unconditionally)
2. A separate `initializeCurrentPage()` function handles first-render setup (dashboard customizations, login detection)
3. The URL-change handler inside the monitor handles all subsequent navigation
4. Remove redundant `setupNavigationMonitor()` calls from `initializePageByType()`

### B5. `auth.js` — Inconsistent logging and side effects in getters

**File:** `src/js/modules/auth.js`

**Problems:**
1. Uses `console.log`/`console.error`/`console.warn` directly (8 instances) instead of `utils.log`/`utils.logError`
2. `getLoginAttempts()` (line 35) has a side effect: resets attempts if timeout has passed. A getter should not modify state
3. `setupLoginSuccessMonitor()` (line 158) polls with `setInterval` instead of integrating with the existing navigation monitor

**Proposal:**
1. Replace all `console.*` calls with `utils.log`/`utils.logError`
2. Separate the timeout check from the getter: `checkAndResetExpiredAttempts()` + pure `getLoginAttempts()`
3. Consider integrating login success detection with the navigation monitor's URL change handler rather than running a parallel poller

### B6. `dashboard.js` — `isDashboardPage()` sends IPC on every call (line 67)

**File:** `src/js/modules/dashboard.js:63-72`

**Problem:** `isDashboardPage()` sends an `update-dashboard-state` IPC message as a side effect. This function is called from the camera hotkey listener on every keydown event on the dashboard, resulting in unnecessary IPC traffic. It looks like a pure check function but has hidden effects.

**Proposal:** Make `isDashboardPage()` pure (just return the boolean). Add a separate `notifyDashboardState()` function. Call the notification explicitly from the navigation monitor's URL change handler where it logically belongs.

### B7. `preload.js` — Widget panel toggle duplicated

**File:** `src/js/preload.js:193-206` and `src/js/preload.js:237-248`

**Problem:** Widget panel toggle logic appears twice: once in the IPC listener for `toggle-widget-panel` and once in `electronAPI.ui.toggleWidgetPanel`. The code is identical (find expand button, click it, wait 350ms, detect state, send IPC).

**Proposal:** Extract to a `toggleWidgetPanel()` function in `ui.js` (since it already handles `handleWidgetPanel()`). Call from both the IPC listener and the electronAPI binding.

### B8. `preload.js` — Button injection duplicated (lines 73-86 vs 33-44)

**File:** `src/js/preload.js`

**Problem:** Initial button injection in `initializeProtectPage()` (lines 73-86) and re-injection in `ensureButtonsInjected()` (lines 33-44) duplicate the same inject-and-register pattern for sidebar, header toggle, and fullscreen buttons.

**Proposal:** Have `initializeProtectPage()` call `ensureButtonsInjected()` instead of repeating the inject/register pattern. The only additional work in `initializeProtectPage()` is the `handleDashboardButton()` call and the state change listener registration, which can stay.

---

## C. Code Quality Improvements

### C1. Magic numbers -> Named constants

**Problem:** Timeouts and intervals scattered as bare numbers across the codebase:

| Value | Location | Purpose |
|-------|----------|---------|
| 5000ms | `preload.js:157` | Delay before initializing update listeners |
| 500ms | `preload.js:132` | Polling interval for protect page transition |
| 120000ms | `preload.js:119` | Max wait for protect page transition |
| 300ms | `uiController.js:261` | Burst enforcement interval |
| 350ms | `preload.js:199,244` | Widget panel CSS transition wait |
| 500ms | `navigation.js:48` | Dashboard customization retry delay |
| 5000ms | `uiController.js:108`, `buttons.js:80,387` | Wait for nav/header/DOM elements |
| 5000ms | `buttonStyles.js:212` | Style checker polling interval |
| 2000ms | `cameras.js:20` | Zoom state wait timeout |
| 45ms | `cameras.js:17` | Fast zoom transition duration |
| 30000ms | `utils.js:8` | Default waitUntil timeout |
| 30000ms | `auth.js:163` | Login success monitor timeout |

**Proposal:** Create `src/js/modules/constants.js` with named exports:
```js
// Timing
exports.UPDATE_LISTENER_DELAY_MS = 5000
exports.PROTECT_PAGE_POLL_MS = 500
exports.PROTECT_PAGE_MAX_WAIT_MS = 120000
exports.ENFORCEMENT_BURST_INTERVAL_MS = 300
exports.WIDGET_TRANSITION_MS = 350
exports.STYLE_CHECKER_INTERVAL_MS = 5000
// etc.
```

### C2. Inconsistent logging

**Problem:** `auth.js` uses `console.*` directly (8 instances). All other modules correctly use `utils.log`/`utils.logError`.

**Proposal:** Replace all `console.*` in `auth.js` with `utils.log`/`utils.logError`. Add `utils.logWarn` for the one `console.warn` call. Verify no other modules have stray `console.*` calls.

### C3. CSS-in-JS -> External stylesheets

**Problem:** `buttonStyles.js` contains 158 lines of CSS as a JS template literal. `updates.js` contains 75 lines of CSS as a JS template literal. Hard to read, no syntax highlighting, no CSS tooling.

**Proposal:** Move to `src/css/button-overrides.css` and `src/css/update-notification.css`. Create a small injection helper that reads the CSS file once (via `fs.readFileSync` at module load time — acceptable in Node.js preload context) and injects it as a `<style>` element. Alternatively, use Electron's `webContents.insertCSS()` from the main process.

**Priority:** P3 — functional but not urgent.

### C4. Style checker polling -> MutationObserver

**File:** `src/js/modules/buttonStyles.js:204-213`

**Problem:** `setupStyleChecker()` polls every 5 seconds to check if the style element still exists. Wasteful.

**Proposal:** The body observer in `uiController.js` already triggers `ensureButtonsInjected()` (via `notifyStateChangeListeners()`), which re-injects styles if missing. Verify this covers all cases where Protect strips our styles, then remove the polling checker.

**Priority:** P3 — low impact.

### C5. Unused exports

**Problem:** Several functions are exported from `buttons.js` but may not be imported elsewhere:
- `createHeaderButton` — used only internally within `buttons.js`
- `createNavButton` — used only internally within `buttons.js`
- `injectDashboardButton` — called only from `handleDashboardButton()` within `buttons.js`
- `setDashboardButtonVisibility` — called only from `handleDashboardButton()` within `buttons.js`

**Proposal:** Audit import sites. Remove from `module.exports` any functions that are only used internally. Keep the module's public API minimal: `injectFullscreenButton`, `injectSidebarButton`, `injectHeaderToggleButton`, `toggleFullscreen`, `triggerDashboardNavigation`, `handleDashboardButton`.

---

## D. Wrapper App Boundary Rules

Since we wrap a third-party React app (UniFi Protect), we need clear rules about what we should and shouldn't touch.

### In scope (our responsibility)

- Custom buttons we inject: sidebar toggle, header toggle, fullscreen, dashboard
- Visibility state of `<nav>` and `<header>` elements (`display: none`/`flex`)
- Our own CSS styles for our injected elements
- Camera tile click dispatching via `[data-viewport]` attributes
- Widget panel expand button clicks
- Login form auto-filling
- Window management, menus, keyboard shortcuts, auto-update

### Out of scope (don't touch)

- Protect's internal styling (don't modify Protect's CSS classes or inline styles except our specific overrides)
- React component state (fiber tree reading is read-only, never write)
- Protect's router internals (we may trigger navigation via link clicks or `window.location.href`, but don't intercept or monkey-patch the router)
- Protect's WebSocket or API connections

### Protect selectors we depend on

These **will break** when UniFi updates Protect. Document them in one place so they're easy to find and update:

| Selector | Used in | Purpose |
|----------|---------|---------|
| `[data-viewport]` | `cameras.js` | Camera tile identification |
| `[class*=ClickCaptureOverlay__Root]` | `cameras.js:63` | Zoom click target |
| `[class*=CameraName]` | `cameras.js:35` | Camera name extraction |
| `[class*=ZoomableViewport]`, `[class*=ViewportRemoveOnceFirefox]`, `[class*=SizeTransitionWrapper]` | `cameras.js:13-17` | Fast zoom CSS override |
| `[class^=liveView__FullscreenWrapper]` | `dashboard.js:15`, `ui.js:10` | LiveView readiness check |
| `[class^=dashboard__Content]` | `dashboard.js:16`, `ui.js:35-36` | Dashboard content styling |
| `[class*=dashboard__Widgets]` | `preload.js:199,244`, `ui.js:104` | Widget panel state detection |
| `[class*=dashboard__StyledExpandButton]` | `preload.js:194,238`, `ui.js:105` | Widget panel toggle button |
| `[class^=liveView__LiveViewWrapper]` | `ui.js:39,44,66` | LiveView container styling |
| `[class^=liveview__ViewportsWrapper]` | `ui.js:58,67` | Viewport aspect ratio calc |
| `[class^=common__Widget]` | `ui.js:39` | Widget border removal |
| `[class^=dashboard__Scrollable]` | `ui.js:44` | Scroll padding removal |
| `[data-testid="option"]` | `ui.js:74` | Option buttons readiness |
| `nav[class*="Nav__"]`, `nav[class*="nav-auto__"]` etc. | `buttonStyles.js:84-91` | Nav padding overrides |
| `ReactModalPortal` | `ui.js:13` | Modal detection/closing |
| `__reactFiber$*`, `__reactInternalInstance$*` | `cameras.js:229` | React fiber tree access |
| `memoizedProps.zoomedSlotIdx` | `cameras.js:235` | Zoom state reading |

### Fragility acceptance

- CSS class selectors like `[class*="dashboard__Content"]` will break when Protect updates its build hashes or refactors component names
- React fiber inspection is fragile by nature. The specific props we read (`zoomedSlotIdx`) and the traversal depth (up to 30 levels) may need adjustment
- Login form selectors use generic patterns (`input[type="password"]`, `button[type="submit"]`) which are more stable

---

## E. Testing Strategy

### Current state

No testing framework, no test files, no test scripts. ~4,139 lines of untested code.

### Recommended stack

- **Unit tests:** Vitest + happy-dom (lighter than jsdom, supports MutationObserver)
- **E2E tests:** Playwright with `_electron` support (first-class Electron testing)

### New devDependencies

```json
{
  "vitest": "^2.0.0",
  "happy-dom": "^14.0.0",
  "@playwright/test": "^1.48.0"
}
```

### Directory structure

```
test/
  setup.js                      # Mock electron, global setup
  unit/
    utils.test.js
    uiController.test.js
    buttons.test.js
    auth.test.js
    timeouts.test.js
    cameras.test.js
  e2e/
    app-launch.spec.js
    nav-header-toggle.spec.js
    fullscreen.spec.js
    dashboard-button.spec.js
    camera-zoom.spec.js
    login.spec.js
  fixtures/
    mockConfig.json
vitest.config.js
playwright.config.js
```

### Scripts to add

```json
{
  "test": "vitest run",
  "test:watch": "vitest --watch",
  "test:e2e": "playwright test",
  "test:e2e:debug": "playwright test --debug",
  "test:all": "vitest run && playwright test"
}
```

### E1. Unit tests (Vitest)

Mock `electron` globally in `test/setup.js`:
```javascript
vi.mock('electron', () => ({
  ipcRenderer: { invoke: vi.fn(), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
}))
```

What to unit test:

| Module | What to test | Mocking needed |
|--------|-------------|----------------|
| `utils.js` | `waitUntil` (resolve, timeout, transient errors), `setStyle`, `clickElement`, `log`/`logError` | None (pure helpers) |
| `timeouts.js` | Set/clear/clearAll tracking | None |
| `uiController.js` | State transitions (`toggleAll`, `toggleNav`, `toggleHeader`); `enforceCurrentState` logic; button registry (register, unregister, notify); `onStateChange` listener; `toggleInProgress` guard; `handleUrlChange` triggers enforcement | Mock `ipcRenderer`, mock DOM |
| `buttons.js` | `createHeaderButton` injects into DOM; `injectFullscreenButton` returns updater; `injectSidebarButton` updater reflects state; `handleDashboardButton` visibility logic | Mock `ipcRenderer`, mock DOM, mock `fs.readFileSync` |
| `auth.js` | `isLoginPage` detection; `getLoginAttempts`/`updateLoginAttempts` counting; max attempts enforcement; `attemptLogin` form filling | Mock `ipcRenderer`, mock DOM |
| `cameras.js` | `detectCameras` finds `[data-viewport]` tiles; `clickTileOverlay` dispatches correct events; `zoomToCamera` unzoom-then-zoom sequence; hotkey listener skips inputs/modifiers | Mock `ipcRenderer`, mock DOM |

### E2. E2E tests (Playwright)

Since E2E tests depend on a live UniFi Protect instance, two modes:
1. **Mock server mode** — Serve minimal HTML mimicking Protect's DOM structure. Best for CI.
2. **Live server mode** — Point at a real Protect instance. Manual validation only.

Test scenarios:

| Test | What it validates |
|------|-------------------|
| App launches successfully | Window created, preload runs, electronAPI exposed |
| Nav toggle button appears in header | Button injection, correct initial state from config |
| Clicking nav toggle hides/shows nav | uiController state -> DOM enforcement -> button label update |
| Header toggle button in nav sidebar | Button injection in nav, chevron direction matches state |
| Menu "Hide Nav" triggers toggle | IPC from main -> renderer, state change, button sync |
| Fullscreen button shows correct state | Fullscreen IPC sync, icon switch |
| Dashboard button visible when nav hidden | Dashboard button visibility logic |
| Camera hotkey (1-9) zooms tile | Hotkey listener, click dispatch, zoom state |
| Camera hotkey (0) unzooms | Unzoom flow, state reset |
| State persists after SPA navigation | Navigate away and back, buttons re-inject with correct state |
| Widget panel toggle works | Expand button click, state notification to main |

### CI integration

- Unit tests run in CI on every push (add to `.github/workflows/ci.yml`)
- E2E tests with mock server in CI (optional, depends on complexity)
- E2E tests against live server are manual-only

---

## F. Priority & Sequencing

### P1 — Quick wins (do first) ✅ COMPLETE

| # | Item | Status |
|---|------|--------|
| 1 | Inline dashboard SVG, remove `fs.readFileSync` | ✅ Done |
| 2 | Fix `isDashboardPage()` IPC side effect | ✅ Done |
| 3 | Extract duplicated widget panel toggle | ✅ Done |
| 4 | Deduplicate button injection in `preload.js` | ✅ Done |
| 5 | Split `updates.js` into main + renderer | ✅ Done |

### P2 — Code quality + testing infrastructure ✅ COMPLETE

| # | Item | Status |
|---|------|--------|
| 6 | Create `constants.js` for magic numbers | ✅ Done |
| 7 | Standardize logging in `auth.js` | ✅ Done |
| 8 | Simplify `navigation.js` init paths | ✅ Done |
| 9 | Set up Vitest + happy-dom with electron mocks | ✅ Done |
| 10 | Write unit tests for `utils.js`, `timeouts.js` | ✅ Done |
| 11 | Write unit tests for `uiController.js` | ✅ Done (DI pattern for testability) |
| 12 | Set up Playwright with `_electron` support | ✅ Done |
| 13 | Write E2E smoke test (app launch, button injection) | ✅ Done (4 tests) |

### P3 + Future (deferred)

| Item | Effort | Risk |
|------|--------|------|
| Full E2E test suite (all scenarios) | Large | Low |
| Move CSS-in-JS to external stylesheets | Medium | Low |
| Replace style checker polling with observer | Small | Low |
| Audit and trim unused exports from `buttons.js` | Small | Low |
| Extract `mainWorldBridge()` helper for fiber access | Small | Low |
| Add ESLint | Medium | N/A |

### Note on navigation.js simplification

The refactored navigation must preserve an initial-load code path. The current `initializeUI()` inside `setupNavigationMonitor()` handles first-render setup (dashboard customizations on the current page). Relying solely on the URL-change monitor would miss first-render.

**Proposed approach:** Make initialization explicit and separate from the monitor:
1. `initializeCurrentPage()` — runs once at startup, applies to current page
2. `setupNavigationMonitor()` — runs once, watches for future URL changes
3. Both called from `initializeWithPolling()`, replacing the current recursive `initializePageByType()` pattern
