# UniFi Protect Viewer — Development Guide

## Quick Reference

```bash
pnpm start              # Compile TS + run the app
pnpm dev                # Compile TS + run with NODE_ENV=development
pnpm build:ts           # Compile TypeScript only
pnpm build:ts:watch     # Compile TypeScript in watch mode
pnpm clean              # Remove builds/dist/out
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

### TypeScript & Build

- **Source**: TypeScript in `main.ts` and `src/ts/` (strict mode, CJS output)
- **Compiled output**: `out/` directory (mirrors source tree structure)
- **Compiler**: `tsc` (no bundler) — config in `tsconfig.json`
- **Entry point**: `package.json` `"main"` points to `out/main.js`
- **Static assets**: `src/html/`, `src/css/`, `src/img/` (not compiled, referenced via `paths.ts`)
- **Path resolution**: `src/ts/modules/paths.ts` uses `app.getAppPath()` for reliable HTML/CSS/img/preload paths regardless of where compiled JS runs from
- **Pre-compilation**: `prestart` and `predev` hooks auto-run `tsc` before `pnpm start`/`pnpm dev`

### Process Model

```
Main process (main.ts)
  +-- window.ts         Window creation & management
  +-- ipc.ts            IPC handler registration
  +-- menu.ts           Application menu
  +-- updates-main.ts   Auto-updater, dialogs, scheduling
  +-- version.ts        Version info
  +-- dialogs.ts        Reusable dialog helpers
  +-- paths.ts          Centralized path resolution

Renderer process (preload.ts)
  +-- uiController.ts   State management (nav/header/fullscreen)
  +-- buttons.ts        Button injection & updater functions
  +-- buttonStyles.ts   CSS injection for custom elements
  +-- navigation.ts     URL monitoring, page-type detection
  +-- cameras.ts        Camera detection, zoom dispatch, hotkeys
  +-- dashboard.ts      Dashboard readiness & initialization
  +-- ui.ts             LiveView customizations, widget panel
  +-- auth.ts           Auto-login form filling
  +-- updates-renderer.ts  Update notification UI (renderer side)
  +-- electron-ipc.ts   Thin wrapper around electron IPC (testability)
  +-- utils.ts          Shared helpers (logging, DOM utilities)
  +-- timeouts.ts       Tracked timeout management
  +-- constants.ts      Shared timing/config constants
```

### Dependency Flow

```
preload.ts (orchestration)
    |
    +---> uiController.ts (state management)
    |         |
    |         +---> utils.ts
    |         +---> buttonStyles.ts
    |
    +---> buttons.ts (dumb views, NO uiController import)
    |         |
    |         +---> utils.ts
    |         +---> buttonStyles.ts
    |
    +---> navigation.ts ---> ui.ts, auth.ts, dashboard.ts
    +---> cameras.ts
    +---> updates-renderer.ts (renderer exports only)
```

Key rule: `buttons.ts` does NOT import `uiController`. Buttons are dumb views — they accept `onClick` callbacks and return updater functions `(state) => void`.

### Type Definitions

Shared interfaces live in `src/ts/types/`:
- `state.ts` — `UIState`, `UIInternalState`
- `config.ts` — `AppConfig`, `WindowBounds`
- `ipc.ts` — Typed IPC channel maps
- `buttons.ts` — `ButtonUpdater`, button option types
- `cameras.ts` — `CameraInfo`
- `electron-api.ts` — `ElectronAPI` (contextBridge contract)

## Module Responsibilities

**`preload.ts`:**

- Orchestration: wires buttons to controller, routes IPC, exposes `electronAPI`.
- Does not contain business logic or state management.

**`uiController.ts`:**

- Single source of truth for nav/header/fullscreen visibility; MutationObserver enforcement; button registry.
- Uses dependency injection for `ipcRenderer` via `initialize({ ipcRenderer })` — enables unit testing without module mocking.
- Does not inject buttons or create DOM elements.

**`electron-ipc.ts`:**

- Thin wrapper that re-exports `require('electron').ipcRenderer`.
- Used as the production fallback when `uiController.initialize()` is called without DI.

**`buttons.ts`:**

- DOM element creation for buttons; returns updater functions.
- Does not import uiController or manage state.

**`ui.ts`:**

- `handleLiveView`, `initializeDashboardPage`, `handleWidgetPanel`.
- Does not inject buttons or manage state.

**`navigation.ts`:**

- URL change monitoring via MutationObserver + popstate; delegates to uiController.
- Does not directly manipulate DOM.

**`cameras.ts`:**

- Camera tile detection, zoom dispatch, hotkey listener, React fiber bridge.
- Does not persist state.

- **`dashboard.ts`:**
  Dashboard readiness polling, initialization coordination. Delegates UI customization to ui.ts.

**`auth.ts`:**

- Login page detection, credential filling, attempt tracking.
- Does not monitor navigation.

**`buttonStyles.ts`:**

- CSS injection + periodic style checker.
- Does not create buttons.

**`paths.ts`:**

- Centralized path resolution using `app.getAppPath()`.
- Exports `htmlPath()`, `imgPath()`, `cssPath()`, `preloadPath()`, `downloadPreloadPath()`.
- Main process only — `app` is not available in the renderer.

**`utils.ts`:**

- `waitUntil`, `setStyle`, `clickElement`, `log`/`logError`, `logger`.
- No side effects or IPC.

**`timeouts.ts`:**

- Named timeout tracking with `set`/`clear`/`clearAll`.
- No business logic.

## Design Principles

1. **Single source of truth** — `uiController.ts` owns all UI visibility state. No duplicate state in buttons, navigation, or global flags.

2. **One-way dependency flow** — `preload.ts` -> `uiController.ts` -> `utils.ts`. The controller never imports buttons, and buttons never import the controller.

3. **Dumb views** — Button inject functions accept `onClick` and return updater functions `(state) => void`. Updaters are registered with `uiController.registerButton(id, updater)` and called with current state on every change.

4. **Main process is authoritative** — For window state (fullscreen), the main process is the source of truth. The controller listens for `fullscreen-change` IPC events.

5. **Idempotent operations** — Button injection and style injection check for existing elements before creating. Safe to call repeatedly during SPA navigation.

6. **Lazy require for circular deps** — `navigation.ts` and `ui.ts` use `require('./uiController')` inside functions (not at module top level) to avoid circular dependency issues. These are typed with `as typeof import('./uiController')`.

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

| Selector                                         | File              | Purpose                    |
| :----------------------------------------------- | :---------------- | :------------------------- |
| `[data-viewport]`                                | cameras.ts        | Camera tile identification |
| `[class*=ClickCaptureOverlay__Root]`             | cameras.ts        | Zoom click target          |
| `[class*=CameraName]`                            | cameras.ts        | Camera name extraction     |
| `[class*=ZoomableViewport]`                      | cameras.ts        | Fast zoom CSS override     |
| `[class^=liveView__FullscreenWrapper]`           | dashboard.ts, ui.ts | LiveView readiness       |
| `[class^=dashboard__Content]`                    | dashboard.ts, ui.ts | Dashboard content styling |
| `[class*=dashboard__Widgets]`                    | preload.ts, ui.ts | Widget panel state         |
| `[class*=dashboard__StyledExpandButton]`         | preload.ts, ui.ts | Widget panel toggle        |
| `[class^=liveView__LiveViewWrapper]`             | ui.ts             | LiveView container         |
| `[class^=liveview__ViewportsWrapper]`            | ui.ts             | Viewport aspect ratio      |
| `__reactFiber$*` / `memoizedProps.zoomedSlotIdx` | cameras.ts        | React fiber zoom state     |

## Code Standards

### TypeScript

- All source code is TypeScript with `strict: true`
- CJS output (`"module": "CommonJS"` in tsconfig)
- Electron imports use: `const { app } = require('electron') as typeof import('electron')`
- Lazy requires are typed: `const mod = require('./module') as typeof import('./module')`
- Shared types live in `src/ts/types/`
- No `any` unless truly necessary (e.g., electron-updater's untyped API)

### Logging

- Use `utils.log()` and `utils.logError()` for all logging. Never use bare `console.log`/`console.error` in module code.
- `utils.log` only outputs in development mode. `utils.logError` always outputs (simplified in production).

### Constants

- Use named constants for timeouts, intervals, and configuration values. No magic numbers.
- Timing constants should live in `constants.ts` or as named constants at the top of the file that uses them.

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
- Tests: `test/unit/*.test.ts`
- Electron mock: `test/setup.ts` — mocks `ipcRenderer`, `contextBridge`
- CJS require interception: `test/__mocks__/electron.ts` + `Module._resolveFilename` in test files
- Run: `pnpm test` or `pnpm test:watch`
- New modules should have corresponding test files

### Vitest CJS/ESM Mocking

- **Vitest 4.x `vi.mock()` does NOT intercept CJS `require()` calls** — only ESM `import`/`await import()`
- Modules loaded in tests via `await import()` go through Vite's ESM pipeline and can be mocked with `vi.mock()`
- Modules that use top-level `require('electron')` need the `Module._resolveFilename` interception pattern (see `buttons.test.ts` for example)
- uiController uses **dependency injection** instead of module mocking — pass mock IPC via `initialize({ ipcRenderer: mockIpc })`

### E2E tests (Playwright with `_electron`)

- Config: `playwright.config.js`
- Tests: `test/e2e/*.spec.js`
- Mock server mode for CI, live server mode for manual validation
- Run: `pnpm test:e2e`

### CI

- TypeScript type-checking (`tsc --noEmit`) on every push
- Unit tests run on every push (`.github/workflows/ci.yml`)
- Build validation on macOS, Linux, Windows
- E2E with mock server: optional CI job
- E2E against live Protect: manual only

## Before Committing

1. Run prettier:
   ```bash
   pnpm exec prettier --write "src/**/*.{ts,css,html}" "*.ts" "test/**/*.ts" "scripts/**/*.js"
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

- **TypeScript** (`tsc`) — compiler, `tsconfig.json`
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
