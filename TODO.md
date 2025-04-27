# TODO

## Features

- Add "FullScreen" button on header to the left of the "dark mode" button.
- Add hotkeys
  - Stretch Goals: - switching cameras - switching between views - zoom in and out - mute and unmute audio
    √ Windows build for ARM64
- Sign Windows executables
  - I need a OV certificate from Azure, awaiting validation
  - I need to have a properly registered business
  - My business probably needs to be of a certain age

## Known Bugs

- Update check sometimes showed twice
- Kind of ugly update check status dialog
- Download progress dialog gets cut off and doesn't correctly show the download status
- ensure that latest-mac.yml has all the files in it.
- Windows version is not signed

  - I need a OV certificate
  - I need to have a properly registered business
  - My business probably needs to be of a certain age

- UI Customizations sometimes don't take effect when first logging in
- https://github.com/jdlien/unifi-protect-viewer/releases/download/v1.1.2/UniFi-Protect-Viewer-arm64.AppImage is 404 on GitHub if not logged in

## Optimization

- Consider switching to ES modules
  - I've attempted this with the help of Claude but it never works very well.
