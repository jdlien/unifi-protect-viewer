# UniFi Protect Viewer

This Electron app is a wrapper for UniFi Protect that gives a clean interface which maximizes the live view, and automatically logs you in. When you first launch the app, you'll be prompted to enter a URL for your Protect console and your Ubiquiti credentials (or, if connecting directly to a console, you can also use a local account). This will typically be something like `https://192.168.1.1/protect`, although if the site you're accessing is not on your network, you may need to use your Internet IP address or hostname.

The app will then automatically log in and present you with the live view you selected.

## Credits

This application is based on the [UniFi Protect Viewer](https://github.com/digital195/unifi-protect-viewer) by Sebastian Loer, but has been heavily modified. It now only works with Protect v4/5. The chief difference is that this version is designed to allow you the Protect application as you normally would without any features removed, where the original was intended as a kiosk application that isn't intended to be interacted with beyond viewing the live view.

This version removes fewer of the features/elements of UniFi Protect than the original, allowing navigation between different parts of the app. The following features have also been added:

- You can toggle navigation/header by pressing `Escape`
- A button shows allowing you to easily return to the dashboard view if you leave it
- The configuration and error pages have been redesigned
- The latest version of Electron is now used (v33)

## Installation

You can build this app yourself by cloning or downloading this repository.

Copy the finished build to a location of your choice, then start the application from that directory.

## Building

Install all dependencies with `npm install`. After this you can build the application yourself for your needed platform.

For some platforms there are scripts inside the package.json.

`npm run build:ia32:windows`

`npm run build:x64:macos`

`npm run build:arm64:macos`

`npm run build:x64:linux`

## Known Issues

Currently, enhanced codec (h.265) support does not appear to work in Windows (likely due to licensing limitations in Electon). Let me know if you have any ideas on how to fix this — one potential solution is to use a fok of electron with HEVC support like https://github.com/AAAhs/electron-hevc

## Usage

After configuration the app will automaticly start the live view after startup. If you want to change the configuration you can press `F10` to reset all settings and restart the configuration process.

- F9: Restart
- F10: Restart & Reset
- Escape: Toggle Navigation
