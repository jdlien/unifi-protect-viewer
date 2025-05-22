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
- Automatic updates

## Credits

This application was based on [UniFi Protect Viewer](https://github.com/digital195/unifi-protect-viewer) by Sebastian Loer, but has now been almost completely rewritten. It now only works with Protect v5. The chief difference is that this version still allows you to use all the features of UniFi Protect. In contrast, the original was intended as a kiosk application that isn't intended to be interacted with beyond viewing the live view. This difference has resulted in this version being substantially more complex.

Some of the features included by this version are:

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

There is an `npm run super-release` script that will build and sign the app for all platforms.

### Code Signing

#### macOS

This application is signed and notarized for macOS. See the `scripts/sign-builds.js` file for details on the macOS signing process.

#### Windows

Windows builds are signed with a code signing certificate belonging to my company (FullSpec Systems) using SSL.com's CodeSignTool.

## Usage

After configuration, the app will automatically start the live view upon startup. If you want to change the configuration, you can press `F10` (or use the UniFi Protect Viewer menu)to reset all settings and restart the configuration process.

- Escape: Toggle Navigation
- F9: Restart
- F10: Restart & Reset

## Known Issues

- Currently, enhanced codec (h.265) support does not appear to work in some operating systems, like Windows ARM64 and Linux. Let me know if you have any ideas on how to fix this.
- After toggling header+nav visibility, the icon at the top left corner for toggling the header can get out of sync.
-

## Planned Features

- A 'hide header+nav' button may be added to the header.
- A widget panel toggle button may be added to the header.
- Hotkeys to switch between cameras or Multi-Views.
