# Changelog

## [2.1.0] - 2026-02-20

### Added

- **Cameras menu** between View and Help that dynamically lists cameras on the current liveview dashboard
- **Number key hotkeys** (1-9) to zoom into individual cameras, 0 to unzoom back to grid
- Camera zoom via menu items with checkbox indicators showing the currently zoomed camera
- Smart camera switching: pressing a different number while zoomed switches directly to the new camera
- "Show All Cameras" menu item to return to grid view
- Zoom is disabled on the "All Cameras" dashboard view where Protect doesn't support it

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
