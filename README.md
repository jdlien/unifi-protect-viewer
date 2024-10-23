# UniFi Protect Viewer

This Electron app is a wrapper for the UniFi Protect liveview that gives a clean interface that maximizes the live view. It allows you to view your liveview from a simple app with automatic login. When you first launch the app, you'll be prompted to enter your UniFi Protect credentials and the URL to your UniFi Protect instance. This will typically be something like `https://192.168.1.1/protect`, although if the site you're accessing is not on your network, you may need to use your Internet IP address or hostname.

The app will then automatically log in and present you with the liveview you selected.

## Credits

This application is based on the [UniFi Protect Viewer](https://github.com/digital195/unifi-protect-viewer) by Sebastian Loer, but has been heavily modified and only works with UniFi Protect 4+ and has been updated to work with the latest Electron version.

This version removes fewer of the features of the original app, than the original, allowing navigation between different parts of the app, and you can toggle the navigation and header by pressing `Escape`. There is a button that allows for you to easily return to the dashboard view if you leave it.

## Installation

You can build this app yourself by cloning or downloading this repository.

Copy the finished build to a location of your choice, then start the application from that directory.

## Building

Install all dependencies with the `npm install` or `npm i` command. After this you can build the application yourself for your needed platform.

For some platforms there are scripts inside the package.json.

`npm run build:ia32:windows`

`npm run build:x64:macos`

`npm run build:arm64:macos`

`npm run build:x64:linux`

## Usage

After configuration the app will automaticly start the liveview after startup. If you want to change the configuration or when you misspell your credentials you can press `F10` to reset all settings and restart the configuration process.

- F9 Restart
- F10 Restart & Reset
