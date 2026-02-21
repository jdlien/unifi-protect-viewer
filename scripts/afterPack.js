const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const { execFileSync } = require('child_process')
const path = require('path')

/**
 * afterPack hook for electron-builder.
 * Flips Electron fuses on the packaged binary to harden the production app,
 * then ad-hoc re-signs on macOS (fuse flipping invalidates the code signature).
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

  // On macOS, fuse flipping invalidates the Electron code signature.
  // Ad-hoc re-sign so local builds launch without SIGKILL.
  // In CI, electron-builder's real signing step overwrites this.
  // Skip for universal build temp dirs — the differing CodeResources files
  // would cause the universal merge to fail.
  if (platform === 'darwin' && !context.appOutDir.includes('-temp')) {
    console.log('Ad-hoc re-signing macOS app after fuse flip...')
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', electronBinaryPath])
    console.log('Ad-hoc signing complete')
  }
}
