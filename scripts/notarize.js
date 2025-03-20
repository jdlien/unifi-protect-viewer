/**
 * This script handles the macOS notarization process
 * It is called by electron-builder after the app is signed
 */
const { notarize } = require('@electron/notarize')
const { build } = require('../package.json')
require('dotenv').config()

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build')
    return
  }

  // Skip notarization in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping notarization in development mode')
    return
  }

  // Check for required environment variables
  if (
    !process.env.APPLE_ID ||
    !process.env.APPLE_ID_PASSWORD ||
    !process.env.APPLE_TEAM_ID ||
    process.env.APPLE_ID === 'your.email@example.com' ||
    process.env.APPLE_ID_PASSWORD === 'app-specific-password-here' ||
    process.env.APPLE_TEAM_ID === 'your-team-id-here'
  ) {
    console.log('Skipping notarization: APPLE_ID, APPLE_ID_PASSWORD, or APPLE_TEAM_ID not properly set')
    console.log('Update the values in your .env file with real credentials to enable notarization')
    return
  }

  console.log('Notarizing macOS application...')

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  const appBundleId = build.appId

  try {
    await notarize({
      appPath,
      appBundleId,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    })
    console.log(`Notarization completed for ${appName}`)
  } catch (error) {
    console.error('Notarization failed:', error)
    // Don't throw the error to allow the build to continue
  }
}
