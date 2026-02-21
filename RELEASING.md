# Releasing UniFi Protect Viewer

## Automated Release (GitHub Actions)

Push a version tag to trigger the release workflow:

```bash
git tag v2.0.0
git push origin v2.0.0
```

The workflow builds for all platforms, signs where credentials are configured, and creates a GitHub Release with all artifacts.

## Required GitHub Secrets

### macOS Code Signing & Notarization

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.p12` certificate file (Developer ID Application) |
| `CSC_KEY_PASSWORD` | Password for the `.p12` certificate |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (generate at appleid.apple.com) |
| `APPLE_TEAM_ID` | Apple Developer Team ID (`A93Q7MKECL`) |

**Exporting the certificate:**

```bash
# Export from Keychain Access as .p12, then base64-encode:
base64 -i DeveloperIDApplication.p12 | pbcopy
# Paste as CSC_LINK secret value
```

### Windows Code Signing (Azure Trusted Signing)

| Secret | Description |
|--------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Azure app registration client ID |
| `AZURE_CLIENT_SECRET` | Azure app registration client secret |

The signing account (`jdlien-signing`) and profile (`jdlien-public-trust`) are hardcoded in the workflow — same as the secrt project.

### Minimal Required

Only `GITHUB_TOKEN` is strictly required (provided automatically). Without signing secrets, the workflow still builds and publishes unsigned artifacts.

## Local Release (manual)

CI-based tag releases are the recommended path. Local release scripts are available for emergency/manual workflows only.

For local pre-release build validation:

```bash
# Compiles TypeScript, then packages
pnpm build:mac
pnpm build:win-x64
pnpm build:linux
```

### Local Signing Credentials (.env)

```env
GH_TOKEN=ghp_...
APPLE_ID=your@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=A93Q7MKECL
SSL_COM_USERNAME=your@email.com
SSL_COM_PASSWORD=...
SSL_COM_CREDENTIAL_ID=...
SSL_COM_TOTP_SECRET=...
```

## Build Artifacts

| Platform | Formats | Architectures |
|----------|---------|---------------|
| macOS | `.dmg`, `.zip` | x64, arm64, universal |
| Windows | `.exe` (NSIS), `.zip` | x64, arm64 |
| Linux | `.AppImage`, `.deb` | x64, arm64 |
