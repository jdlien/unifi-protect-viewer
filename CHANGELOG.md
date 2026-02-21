# Changelog

## [2.2.2] - 2026-02-21

### Fixed

- Configuration page showing white screen in production builds — replaced `file://` URLs with custom `app://` protocol to work with `GrantFileProtocolExtraPrivileges` security fuse
- Error page infinite recursion loop when a page fails to load — added `isMainFrame` check and recursion guard to `did-fail-load` handler
- Windows auto-updater SHA-512 checksum mismatch — fixed YAML list item regex in `recompute-checksums.js` (`  - url:` was not matched by `\s+`)
- Update dialogs on Windows showing application menu bar (File, Edit, etc.)

### Changed

- Added logging, validation, and error handling to `recompute-checksums.js` so CI failures are visible instead of silent

## [2.2.1] - 2026-02-21

### Fixed

- Update download progress dialog rendering as a blank dark rectangle — inlined CSS to eliminate external stylesheet dependency and added default text colors
- Download status text clipping below the dialog window — reduced padding/gaps for compact layout

### Changed

- Redesigned update dialogs with macOS-native styling: custom rounded progress bar with system blue accent, translucent text, tabular-nums for stable digit widths, and a spinner for the "checking" dialog
- Cross-platform dialog appearance: macOS vibrancy, Windows 11 Mica material, solid background fallback for Windows 10/Linux
- Added "Simulate Update Download" menu item (dev mode only) under Help for testing the download progress UI without a real update

### Removed

- `src/css/update-styles.css` — styles are now inlined in each HTML dialog

## [2.2.0] - 2026-02-21

### Added

- **Configuration menu item** (`Cmd+,` / `Ctrl+,`) to access settings from any page without resetting configuration
- Platform-aware hotkey labels on the config page (shows `⌘` on macOS, `Ctrl` on Windows/Linux)
- Platform-specific **Window menu**: native macOS Window menu role and Windows-style Window menu with Minimize/Close actions
- 234 unit tests across 10 test files (Vitest + happy-dom), up from zero
- Comprehensive Playwright E2E test suite (69 tests across 11 spec files) covering login, dashboard, buttons, navigation, cameras, widget panel, menu, fullscreen, and config page
- E2E tests skip gracefully when Protect server credentials are not available
- CI jobs for TypeScript type-checking and unit tests

### Changed

- **Migrated entire codebase from JavaScript to TypeScript** with `strict: true` — all 21 source modules, main entry point, and test files
- Diagnostics table on config page uses a cleaner 3-column layout with codec capabilities in separate rows
- Split dual-process `updates.js` into `updates-main.ts` and `updates-renderer.ts`
- Extracted magic numbers into `constants.ts`
- Standardized all renderer logging through `utils.log`/`logError`/`logWarn`
- Simplified navigation initialization to a single code path
- Updated README build instructions for pnpm workflow

### Fixed

- Redundant arch flags in universal macOS CI build causing extra per-arch artifacts

## [2.1.2] - 2026-02-20

### Fixed

- Cameras menu items stuck grayed out after navigating to/from the "All Cameras" dashboard view
- Number key hotkeys not working on "All Cameras" dashboard view

### Changed

- Removed freeze-frame canvas overlay during camera switching (added complexity without visual improvement)
- Camera switching now uses fast (45ms) transitions instead of disabling them entirely, smoothing out the visual transition

## [2.1.1] - 2026-02-20

### Fixed

- Custom buttons (sidebar toggle, header toggle, fullscreen) not appearing after first login on a new computer where the initial page is the login screen instead of a /protect/ page

## [2.1.0] - 2026-02-20

### Added

- **Cameras menu** between View and Help that dynamically lists cameras on the current liveview dashboard
- **Number key hotkeys** (1-9) to zoom into individual cameras, 0 to unzoom back to grid
- Camera zoom via menu items with checkbox indicators showing the currently zoomed camera
- Smart camera switching: pressing a different number while zoomed switches directly to the new camera
- "Show All Cameras" menu item to return to grid view

### Changed

- Programmatic camera zoom (keyboard/menu) uses fast transitions for near-instant switching
- Zoom state polling uses requestAnimationFrame instead of fixed timeouts, adapting to actual render speed

## [2.0.0] - 2026-02-20

Major release targeting UniFi Protect v6+ with a complete architecture overhaul.

### Breaking Changes

- Now requires UniFi Protect v6 or later
- Switched package manager from npm to pnpm

### Architecture

- Centralized all UI state management into a new `UIController` module — single source of truth for nav/header/fullscreen visibility
- One-way dependency flow: `preload.js` → `uiController.js` → `utils.js`, `buttonStyles.js`
- Buttons follow a dumb view pattern: inject functions accept `onClick` and return updater functions
- Single `MutationObserver` for nav/header style enforcement with burst enforcement after SPA navigation
- Removed all `window._*` global flags in favor of controller state

### Added

- Dynamic Show/Hide menu labels that reflect current UI visibility state
- Codec diagnostics for troubleshooting video playback issues
- GitHub Actions CI and release workflows for automated builds

### Changed

- Updated dashboard icon to match current Protect v6 UI (2x2 grid monitor replacing the old gauge icon)
- Hardened build pipeline with stricter IPC contracts
- Updated all dependencies to latest versions
- Switched from npm to pnpm (v10.23)
- Electron updated to v40.6

### Fixed

- IPC contract mismatches between main and renderer processes
- Fullscreen state is now authoritative from the main process, eliminating race conditions

## [1.1.10] - 2025-05-07

### Fixed

- Header toggle hover style in dark mode

## [1.1.9] - 2025-05-07

### Added

- Header toggle button

### Changed

- F12 is no longer a global shortcut; dev tools menu item moved to Help

## [1.1.8] - 2025-04-18

### Fixed

- Button rendering in more scenarios
- Button spacing issues

## [1.1.7] - 2025-04-17

### Changed

- Refactored codebase into separate modules

### Added

- Sidebar nav toggle button

## [1.1.6] - 2025-04-11

### Changed

- Cleaned up update handling code
- Updated build scripts for more consistent latest version links
- Rebuilt Windows signing process

## [1.1.5] - 2025-04-07

### Changed

- Updates to support electron-builder v26
- Windows signing set up with SSL.com

### Added

- Fullscreen button injected into header

### Fixed

- Fullscreen implementation for new UI button
