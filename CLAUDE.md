# UniFi Protect Viewer — Development Guide

## Quick Reference

```bash
pnpm start              # Run the app in dev mode
pnpm dev                # Run with NODE_ENV=development
pnpm clean              # Remove builds/dist
```

## Before Committing

Always run prettier before committing:

```bash
pnpm exec prettier --write "src/**/*.{js,css,html}" "*.js" "scripts/**/*.js"
```

CI runs `prettier --check` on every push — commits with formatting issues will fail.

## Prettier Config

- No semicolons
- Single quotes
- Trailing commas
- 120 char line width
- 2 space indent

## Architecture

This is an Electron app that wraps the UniFi Protect web UI with custom overlays and controls.

### Key Modules (src/js/)

- `preload.js` — Orchestration layer, button injection, IPC routing
- `modules/uiController.js` — Single source of truth for nav/header/fullscreen visibility state
- `modules/buttons.js` — Dumb button views (inject + updater pattern, no state)
- `modules/ui.js` — Dashboard page customizations, widget panel handling
- `modules/navigation.js` — URL monitoring, delegates to uiController
- `modules/ipc.js` — Main process IPC handlers
- `modules/buttonStyles.js` — CSS injection
- `modules/menu.js` — Application menu (main process)

### Patterns

- One-way deps: `preload.js` → `uiController.js` → `utils.js`, `buttonStyles.js`
- `buttons.js` does NOT import `uiController` — buttons are dumb views
- `navigation.js` and `ui.js` use lazy `require('./uiController')` to avoid circular deps
- No `window._*` globals — all state in uiController
- Fullscreen: main process is authoritative, controller listens for `fullscreen-change` IPC

## Building

### Local macOS build (signed + notarized)

```bash
set -a && source .env && set +a && pnpm build:mac-arm64
```

Requires `.env` with `CSC_LINK` (base64 P12), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

The P12 must be created with `openssl pkcs12 -export -legacy` flag (OpenSSL 3.x uses encryption that macOS `security import` doesn't understand).

### Local Windows build (unsigned)

```bash
pnpm build:win-x64
```

Windows signing happens only in CI via Azure Trusted Signing.

### CI Release (all platforms, signed)

Push a version tag to trigger the full release workflow:

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
