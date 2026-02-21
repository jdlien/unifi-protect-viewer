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

- Access UniFi Protect web UI in a dedicated desktop application
- Toggle sidebar navigation and header with `Escape` or menu/buttons
- **Camera hotkeys**: press `1`–`9` to zoom into individual cameras, `0` to return to grid view
- **Cameras menu** dynamically lists cameras on the current liveview dashboard
- **Configuration page** (`Cmd+,` / `Ctrl+,`) to edit settings without resetting credentials
- Fullscreen mode with dedicated button and `Cmd+Shift+F` / `Ctrl+Shift+F`
- Dashboard button to return to your liveview from any page
- Widget panel management
- Auto-login with saved credentials
- Automatic updates via GitHub releases
- Native application menu with platform-specific Window menu
- Hardened Electron build with security fuses

## Credits

This application was based on [UniFi Protect Viewer](https://github.com/digital195/unifi-protect-viewer) by Sebastian Loer, but has now been almost completely rewritten. It requires UniFi Protect v6 or later. The chief difference is that this version still allows you to use all the features of UniFi Protect. In contrast, the original was intended as a kiosk application that isn't intended to be interacted with beyond viewing the live view. This difference has resulted in this version being substantially more complex.

Some of the differences from the original include:

- Full TypeScript codebase with strict mode
- Toggle navigation/header visibility with buttons, keyboard shortcuts, or menu
- Camera zoom hotkeys and a dynamic Cameras menu
- Configuration page accessible from any screen
- Dashboard button to quickly return to your liveview
- Redesigned configuration and error pages
- Electron v40 with hardened runtime and security fuses

## Installation

You can build this app yourself by cloning or downloading this repository.

Copy the finished build to a location of your choice, then start the application from that directory.

## Building

Install dependencies:

```bash
pnpm install
```

Local builds (TypeScript compile runs automatically before packaging):

```bash
pnpm build:mac
pnpm build:win-x64
pnpm build:linux
```

Releases are CI-driven from tags:

```bash
git tag v2.2.2
git push origin v2.2.2
```

### Code Signing

#### macOS

This application is signed and notarized for macOS. See the `scripts/sign-builds.js` file for details on the macOS signing process.

#### Windows

Windows builds are signed with a code signing certificate belonging to my company (FullSpec Systems) using SSL.com's CodeSignTool.

## Usage

After configuration, the app will automatically start the live view upon startup.

| Shortcut                       | Action                               |
| ------------------------------ | ------------------------------------ |
| `Escape`                       | Toggle sidebar navigation and header |
| `1`–`9`                        | Zoom into camera by position         |
| `0`                            | Return to grid view (unzoom)         |
| `Cmd+,` / `Ctrl+,`             | Open configuration page              |
| `Cmd+Shift+F` / `Ctrl+Shift+F` | Toggle fullscreen                    |
| `F9`                           | Restart                              |
| `F10`                          | Restart & reset all settings         |
