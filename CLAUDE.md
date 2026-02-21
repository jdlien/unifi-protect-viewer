# UniFi Protect Viewer — Development Guide

## Quick Reference

```bash
pnpm start              # Run the app in dev mode
pnpm dev                # Run with NODE_ENV=development
pnpm clean              # Remove builds/dist
pnpm test               # Run unit tests (Vitest)
pnpm test:watch         # Run unit tests in watch mode
pnpm test:e2e           # Run E2E tests (Playwright)
pnpm test:all           # Run unit + E2E tests
```

## Project Task Tracking

This project uses [taskmaster](https://github.com/eyaltoledano/claude-task-master) conventions for tracking tasks, with a `.taskmaster/tasks/tasks.json` using the following structure:

### Directory Structure

```
.taskmaster/
├── tasks/
│   └── tasks.json    # Active tasks
├── docs/
│   └── prd.txt       # Project requirements (optional)
└── archive.json      # Completed tasks (optional)
```

### Schema

```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Brief task title",
        "description": "What needs to be done",
        "status": "pending|in-progress|done|review|deferred|cancelled",
        "priority": "high|medium|low",
        "dependencies": [],
        "subtasks": [
          {
            "id": 1,
            "title": "Subtask title",
            "description": "Subtask details",
            "status": "pending"
          }
        ]
      }
    ]
  }
}
```

### Guidelines

- Create a task when asked, or offer to create a task when a user proposes a complicated, multi-step task that will not be finished immediately.
- Query with: `jq '.master.tasks[] | select(.status=="pending")' .taskmaster/tasks/tasks.json`
- Archive completed tasks periodically to keep `.taskmaster/tasks/tasks.json` lightweight and focused on incomplete tasks.
- Test regularly and ensure high test coverage.

## Architecture Overview

This is an Electron app that wraps UniFi Protect's React web UI with custom overlays and controls (camera zoom hotkeys, nav/header toggle buttons, auto-login, widget panel management).

### Process Model

```
Main process (main.js)
  +-- window.js         Window creation & management
  +-- ipc.js            IPC handler registration
  +-- menu.js           Application menu
  +-- updates-main.js   Auto-updater, dialogs, scheduling
  +-- version.js        Version info
  +-- dialogs.js        Reusable dialog helpers

Renderer process (preload.js)
  +-- uiController.js   State management (nav/header/fullscreen)
  +-- buttons.js        Button injection & updater functions
  +-- buttonStyles.js   CSS injection for custom elements
  +-- navigation.js     URL monitoring, page-type detection
  +-- cameras.js        Camera detection, zoom dispatch, hotkeys
  +-- dashboard.js      Dashboard readiness & initialization
  +-- ui.js             LiveView customizations, widget panel
  +-- auth.js           Auto-login form filling
  +-- updates.js        Update notification UI (renderer side)
  +-- electron-ipc.js   Thin wrapper around electron IPC (testability)
  +-- utils.js          Shared helpers (logging, DOM utilities)
  +-- timeouts.js       Tracked timeout management
```

### Dependency Flow

```
preload.js (orchestration)
    |
    +---> uiController.js (state management)
    |         |
    |         +---> utils.js
    |         +---> buttonStyles.js
    |
    +---> buttons.js (dumb views, NO uiController import)
    |         |
    |         +---> utils.js
    |         +---> buttonStyles.js
    |
    +---> navigation.js ---> ui.js, auth.js, dashboard.js
    +---> cameras.js
    +---> updates.js (renderer exports only)
```

Key rule: `buttons.js` does NOT import `uiController`. Buttons are dumb views — they accept `onClick` callbacks and return updater functions `(state) => void`.

## Module Responsibilities

**`preload.js`:**

- Orchestration: wires buttons to controller, routes IPC, exposes `electronAPI`.
- Does not contain business logic or state management.

**`uiController.js`:**

- Single source of truth for nav/header/fullscreen visibility; MutationObserver enforcement; button registry.
- Uses dependency injection for `ipcRenderer` via `initialize({ ipcRenderer })` — enables unit testing without module mocking.
- Does not inject buttons or create DOM elements.

**`electron-ipc.js`:**

- Thin wrapper that re-exports `require('electron').ipcRenderer`.
- Used as the production fallback when `uiController.initialize()` is called without DI.

**`buttons.js`:**

- DOM element creation for buttons; returns updater functions.
- Does not import uiController or manage state.

**`ui.js`:**

- `handleLiveView`, `initializeDashboardPage`, `handleWidgetPanel`.
- Does not inject buttons or manage state.

**`navigation.js`:**

- URL change monitoring via MutationObserver + popstate; delegates to uiController.
- Does not directly manipulate DOM.

**`cameras.js`:**

- Camera tile detection, zoom dispatch, hotkey listener, React fiber bridge.
- Does not persist state.

- **`dashboard.js`:**
  Dashboard readiness polling, initialization coordination. Delegates UI customization to ui.js.

**`auth.js`:**

- Login page detection, credential filling, attempt tracking.
- Does not monitor navigation.

**`buttonStyles.js`:**

- CSS injection + periodic style checker.
- Does not create buttons.

**`utils.js`:**

- `waitUntil`, `setStyle`, `clickElement`, `log`/`logError`, `logger`.
- No side effects or IPC.

**`timeouts.js`:**

- Named timeout tracking with `set`/`clear`/`clearAll`.
- No business logic.

## Design Principles

1. **Single source of truth** — `uiController.js` owns all UI visibility state. No duplicate state in buttons, navigation, or global flags.

2. **One-way dependency flow** — `preload.js` -> `uiController.js` -> `utils.js`. The controller never imports buttons, and buttons never import the controller.

3. **Dumb views** — Button inject functions accept `onClick` and return updater functions `(state) => void`. Updaters are registered with `uiController.registerButton(id, updater)` and called with current state on every change.

4. **Main process is authoritative** — For window state (fullscreen), the main process is the source of truth. The controller listens for `fullscreen-change` IPC events.

5. **Idempotent operations** — Button injection and style injection check for existing elements before creating. Safe to call repeatedly during SPA navigation.

6. **Lazy require for circular deps** — `navigation.js` and `ui.js` use `require('./uiController')` inside functions (not at module top level) to avoid circular dependency issues.

7. **No `window._*` globals** — All state lives in `uiController`'s internal `state` object. No global flags.

## Wrapper App Boundaries

We wrap a third-party React app (UniFi Protect). These rules define what we touch:

### In scope (our responsibility)

- Custom buttons we inject (sidebar toggle, header toggle, fullscreen, dashboard)
- Visibility of `<nav>` and `<header>` elements (`display: none`/`flex`)
- Our own CSS styles for injected elements
- Camera tile click dispatching via `[data-viewport]` attributes
- Widget panel expand button clicks
- Login form filling
- Window management, menus, keyboard shortcuts, auto-update

### Out of scope (don't touch)

- Protect's internal styling (except our specific overrides)
- React component state (fiber tree reading is **read-only**, never write)
- Protect's router internals (we may trigger navigation via link clicks or `window.location.href`, but don't intercept or monkey-patch the router)
- Protect's WebSocket or API connections

### Fragile Protect selectors

These will break when Protect updates. Keep them documented here:

| Selector                                         | File                | Purpose                    |
| :----------------------------------------------- | :------------------ | :------------------------- |
| `[data-viewport]`                                | cameras.js          | Camera tile identification |
| `[class*=ClickCaptureOverlay__Root]`             | cameras.js          | Zoom click target          |
| `[class*=CameraName]`                            | cameras.js          | Camera name extraction     |
| `[class*=ZoomableViewport]`                      | cameras.js          | Fast zoom CSS override     |
| `[class^=liveView__FullscreenWrapper]`           | dashboard.js, ui.js | LiveView readiness         |
| `[class^=dashboard__Content]`                    | dashboard.js, ui.js | Dashboard content styling  |
| `[class*=dashboard__Widgets]`                    | preload.js, ui.js   | Widget panel state         |
| `[class*=dashboard__StyledExpandButton]`         | preload.js, ui.js   | Widget panel toggle        |
| `[class^=liveView__LiveViewWrapper]`             | ui.js               | LiveView container         |
| `[class^=liveview__ViewportsWrapper]`            | ui.js               | Viewport aspect ratio      |
| `__reactFiber$*` / `memoizedProps.zoomedSlotIdx` | cameras.js          | React fiber zoom state     |

## Code Standards

### Logging

- Use `utils.log()` and `utils.logError()` for all logging. Never use bare `console.log`/`console.error` in module code.
- `utils.log` only outputs in development mode. `utils.logError` always outputs (simplified in production).

### Constants

- Use named constants for timeouts, intervals, and configuration values. No magic numbers.
- Timing constants should live in a `constants.js` module or as named constants at the top of the file that uses them.

### Functions

- Functions should be under ~60 lines. Extract helpers when they grow.
- Keep module public APIs minimal — don't export functions that are only used internally.

### CSS

- Prefer external CSS files in `src/css/` where practical.
- When injecting CSS from JS is necessary (e.g., for dynamic insertion into Protect's DOM), keep the CSS string in a clearly marked constant.

### Error handling

- Wrap IPC calls and DOM operations in try/catch.
- Use `utils.logError` for errors, never silently swallow exceptions.

## Git Practices

### Commit messages

Use conventional commit prefixes, don't use periods, use lowercase except when referencing proper nouns/acronyms:

- `feat:` — new user-facing feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `chore:` — build, CI, dependency updates
- `docs:` — documentation only
- `style:` — formatting, whitespace (no code change)
- `test:` — adding or updating tests

Scope in parentheses when helpful: `fix(auth): prevent double login attempts`

### Commit hygiene

- Atomic commits — one logical change per commit
- Focus on "why" in commit messages, not "what"
- For nontrivial changes, use commit bodies explaining the rationale for the change and summarizing it
- Update `CHANGELOG.md` for user-facing changes
- Semantic versioning for releases

## Testing

### Unit tests (Vitest + happy-dom)

- Config: `vitest.config.js`
- Tests: `test/unit/*.test.js`
- Electron mock: `test/setup.js` — mocks `ipcRenderer`, `contextBridge`
- Run: `pnpm test` or `pnpm test:watch`
- New modules should have corresponding test files

### E2E tests (Playwright with `_electron`)

- Config: `playwright.config.js`
- Tests: `test/e2e/*.spec.js`
- Mock server mode for CI, live server mode for manual validation
- Run: `pnpm test:e2e`

### CI

- Unit tests run on every push (`.github/workflows/ci.yml`)
- E2E with mock server: optional CI job
- E2E against live Protect: manual only

## Before Committing

1. Run prettier:
   ```bash
   pnpm exec prettier --write "src/**/*.{js,css,html}" "*.js" "scripts/**/*.js"
   ```
2. Run tests:
   ```bash
   pnpm test
   ```
3. If you changed user-facing behavior, update `CHANGELOG.md`

CI runs `prettier --check` on every push — commits with formatting issues will fail.

## Prettier Config

- No semicolons
- Single quotes
- Trailing commas
- 120 char line width
- 2 space indent

## Building & Releasing

All release builds (signing, notarization, all platforms) happen in CI. Push a version tag to trigger:

```bash
git tag v2.0.0
git push origin v2.0.0
```

See `RELEASING.md` for secrets setup and full details.

## Build Tools

- **electron-builder** (config in `electron-builder.yml`)
- **pnpm** (v10.23) — package manager
- **@electron/fuses** — security hardening in `scripts/afterPack.js`
- **scripts/sign.js** — Windows SSL.com signing (local only, gracefully skips in CI)

## File Naming Conventions

Artifact names are defined in `electron-builder.yml` and must match README download links:

- macOS: `UniFi-Protect-Viewer-${arch}.dmg` (universal, arm64, x64)
- Windows: `UniFi-Protect-Viewer-Setup-${arch}.exe` (x64, arm64)
- Linux: `UniFi-Protect-Viewer-${arch}.AppImage` (x64, arm64)

## Self-Improvement

As the project evolves and changes, revisit this file and propose changes to keep this consistent with the state of the repository and good best-practices.
