const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')

/**
 * afterPack hook for electron-builder.
 * Flips Electron fuses on the packaged binary to harden the production app.
 */
module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName
  let electronBinaryName

  if (platform === 'darwin') {
    electronBinaryName = context.packager.appInfo.productFilename + '.app'
  } else if (platform === 'win32') {
    electronBinaryName = context.packager.appInfo.productFilename + '.exe'
  } else {
    // Linux uses the executable name (lowercase, from package.json "name")
    electronBinaryName = context.packager.executableName
  }

  const electronBinaryPath = path.join(context.appOutDir, electronBinaryName)

  console.log(`Flipping fuses on: ${electronBinaryPath}`)

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    // Prevent ELECTRON_RUN_AS_NODE env var abuse
    [FuseV1Options.RunAsNode]: false,
    // Block --inspect in production
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Validate ASAR integrity at launch
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    // Force loading app from ASAR only (no loose files)
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Tighten file:// protocol privileges
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  })

  console.log('Fuses flipped successfully')
}
