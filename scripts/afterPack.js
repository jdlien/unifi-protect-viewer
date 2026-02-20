const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')

/**
 * afterPack hook for electron-builder.
 * Flips Electron fuses on the packaged binary to harden the production app.
 */
module.exports = async function afterPack(context) {
  const ext = {
    darwin: '.app',
    linux: '',
    win32: '.exe',
  }

  const electronBinaryName =
    context.packager.appInfo.productFilename + (ext[context.electronPlatformName] ?? '')

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
