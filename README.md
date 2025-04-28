# UniFi Protect Viewer

This Electron app is a wrapper for UniFi Protect that gives a clean interface that maximizes the live view and automatically logs you in. When you first launch the app, you'll be prompted to enter a URL for your Protect console and your Ubiquiti credentials (or, if connecting directly to a console, you can also use a local account). The URL will typically be something like `https://192.168.1.1/protect`, although if the site you're accessing is not on your network, you may need to use your Internet IP address or hostname.

The app will then automatically log in and present you with the live view you selected.

## Downloads

Download the latest version for your platform:

- **macOS**:

  - [Universal (Intel/Apple Silicon)](https://github.com/jdlien/unifi-protect-viewer/releases/latest/download/UniFi-Protect-Viewer-universal.dmg)

- **Windows**:

  - [Windows Installer x64](https://github.com/jdlien/unifi-protect-viewer/releases/latest/download/UniFi-Protect-Viewer-Setup-x64.exe)

  - [Windows Installer ARM64](https://github.com/jdlien/unifi-protect-viewer/releases/latest/download/UniFi-Protect-Viewer-Setup-arm64.exe)

Or view all downloads, including Linux versions, on the [releases page](https://github.com/jdlien/unifi-protect-viewer/releases/latest).

## Features

- Access UniFi Protect web UI in a desktop application
- Native-like experience with application menu
- Automatic updates via GitHub releases
- Stays logged in between sessions
- No need to open a browser

<!-- I'm not sure if this is really needed
## GitHub Authentication for Updates

To enable automatic updates from GitHub, you need to:

1. Create a GitHub Personal Access Token (PAT) at https://github.com/settings/tokens with "repo" scope
2. Set the token as GH_TOKEN environment variable when running the app
3. Or add it to a `.env` file in the root directory:
   ```
   GH_TOKEN=your_token_here
   ```

Without a valid GitHub token, the application will still work, but it won't be able to check for or download updates.
-->

## Credits

This application is based on [UniFi Protect Viewer](https://github.com/digital195/unifi-protect-viewer) by Sebastian Loer, but has been almost completely rewritten. It now only works with Protect v5. The chief difference is that this version is designed to allow you to access the Protect application as you normally would without any features removed. In contrast, the original was intended as a kiosk application that isn't intended to be interacted with beyond viewing the live view.

This version removes fewer of the features/elements of UniFi Protect than the original, allowing navigation between different parts of the app. The following features have also been added:

- You can toggle navigation/header by pressing `Escape`
- There is a menu with many options for modifying the view
- A button shows, allowing you to return to the dashboard view after you leave it
- The configuration and error pages have been redesigned
- The latest version of Electron is now used

## Installation

You can build this app yourself by cloning or downloading this repository.

Copy the finished build to a location of your choice, then start the application from that directory.

## Building

Install all dependencies with `npm install`. After this, you can build the application yourself for the platform you need.

For some platforms, there are scripts inside the package.json.

`npm run build:windows:ia32:windows`

`npm run build:macos:x64`

`npm run build:macos:arm64`

`npm run build:linux:x64`

### Code Signing

#### macOS

This application is signed and notarized for macOS. See the `scripts/sign-builds.js` file for details on the macOS signing process.

#### Windows

Windows builds can be signed using SSL.com's CodeSignTool. See the [Windows Code Signing documentation](./docs/windows-signing.md) for setup instructions.

To build and sign Windows packages:

```bash
# For x64 only
npm run sign:win-x64

# For ARM64 only
npm run sign:win-arm64

# For both x64 and ARM64
npm run sign:win
```

## Known Issues

Currently, enhanced codec (h.265) support does not appear to work in Windows (likely due to licensing limitations in Electron). Let me know if you have any ideas on how to fix this — one potential solution is to use a fork of Electron with HEVC support like https://github.com/AAAhs/electron-hevc

## Usage

After configuration, the app will automatically start the live view upon startup. If you want to change the configuration, you can press `F10` to reset all settings and restart the configuration process.

- Escape: Toggle Navigation
- F9: Restart
- F10: Restart & Reset
