/**
 * This script handles the macOS notarization process
 * It is called by electron-builder after the app is signed
 */
const { notarize } = require('@electron/notarize')
const { build } = require('../package.json')
const path = require('path')
const fs = require('fs')

// Load dotenv if available
try {
  require('dotenv').config({ quiet: true })
} catch (err) {
  console.log('dotenv not available, using hardcoded values')
}

// IMPORTANT: If environment variables aren't working, you can hardcode them here
// These will be used as a fallback if the environment variables don't work
const APPLE_ID = process.env.APPLE_ID || 'jd@jdlien.com'
const APPLE_APP_SPECIFIC_PASSWORD = process.env.APPLE_APP_SPECIFIC_PASSWORD || 'liee-exkd-xmlv-cclh'
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || 'A93Q7MKECL'

// Set APPLE_APP_SPECIFIC_PASSWORD as it might be needed for some builds
process.env.APPLE_APP_SPECIFIC_PASSWORD = APPLE_APP_SPECIFIC_PASSWORD

// Explicitly set the teamId in the environment for the notarization process
process.env.APPLE_TEAM_ID = APPLE_TEAM_ID

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  // Log environment information for debugging
  console.log('Notarization environment (with fallbacks):')
  console.log(`- NODE_ENV: "${process.env.NODE_ENV}"`)
  console.log(`- Using APPLE_ID: ${APPLE_ID}`)
  console.log(`- APPLE_APP_SPECIFIC_PASSWORD is set: ${Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD)}`)
  console.log(`- Using APPLE_TEAM_ID: ${APPLE_TEAM_ID}`)
  console.log(`- Current directory: ${process.cwd()}`)

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

  console.log('Starting macOS notarization process...')

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  const appBundleId = build.appId

  console.log(`Notarizing ${appPath} with bundle ID ${appBundleId}`)

  try {
    console.log('Uploading to Apple notarization service...')
    console.log(`Using team ID: ${APPLE_TEAM_ID}`)

    // Make sure we have the required properties
    if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
      console.error('❌ Missing required Apple credentials for notarization')
      console.error(`APPLE_ID: ${Boolean(APPLE_ID)}`)
      console.error(`APPLE_APP_SPECIFIC_PASSWORD: ${Boolean(APPLE_APP_SPECIFIC_PASSWORD)}`)
      console.error(`APPLE_TEAM_ID: ${Boolean(APPLE_TEAM_ID)}`)
      return
    }

    await notarize({
      appPath,
      appBundleId,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
      teamId: APPLE_TEAM_ID,
    })
    console.log(`✅ Notarization completed successfully for ${appName}`)
  } catch (error) {
    console.error('❌ Notarization failed:', error)
    console.error('Error details:', error.message || error)
    // Don't throw the error to allow the build to continue
  }
}
