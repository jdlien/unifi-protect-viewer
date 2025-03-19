const fs = require('fs')
const path = require('path')
const { glob } = require('glob')
const { execSync } = require('child_process')

// Paths
const buildsDir = path.resolve(__dirname, '../builds')

// Code signing identity
const DEVELOPER_ID = 'Developer ID Application: Joseph Lien (A93Q7MKECL)'

// Clear any existing notarization log
const notarizationLogPath = path.resolve(__dirname, '../notarization-log.json')
if (fs.existsSync(notarizationLogPath)) {
  console.log('Clearing previous notarization log...')
  fs.writeFileSync(notarizationLogPath, '{}')
  console.log('Previous notarization log cleared')
}

// Helper: Sign macOS app bundle
async function signMacOSApp(appPath) {
  console.log(`Signing app bundle: ${appPath}`)
  try {
    // Create a hardened runtime entitlements file
    const entitlementsPath = path.resolve(__dirname, '../entitlements.plist')
    fs.writeFileSync(
      entitlementsPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.inherit</key>
  <true/>
</dict>
</plist>`,
    )
    console.log(`Created entitlements file at ${entitlementsPath}`)

    // Use direct commands for better control and debugging
    console.log('Removing existing signatures...')
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })

    // First sign the problematic helpers
    console.log('Signing Electron helpers first...')
    const crashpadHelperPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/Current/Helpers/chrome_crashpad_handler`

    if (fs.existsSync(crashpadHelperPath)) {
      console.log('Signing chrome_crashpad_handler...')
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${crashpadHelperPath}"`,
        { stdio: 'inherit' },
      )
    }

    // Sign all other helpers within Electron Framework
    const helpersDir = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/Current/Helpers`
    if (fs.existsSync(helpersDir)) {
      const helperFiles = fs.readdirSync(helpersDir)
      for (const helper of helperFiles) {
        if (helper !== 'chrome_crashpad_handler') {
          // Skip the one we already signed
          const helperPath = path.join(helpersDir, helper)
          console.log(`Signing helper: ${helper}`)
          execSync(
            `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${helperPath}"`,
            { stdio: 'inherit' },
          )
        }
      }
    }

    // Sign the problematic libraries that were flagged in notarization
    console.log('Signing problematic libraries...')

    // libEGL.dylib
    const libEGLPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib`
    if (fs.existsSync(libEGLPath)) {
      console.log('Signing libEGL.dylib...')
      execSync(`codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libEGLPath}"`, {
        stdio: 'inherit',
      })
    }

    // libGLESv2.dylib
    const libGLESv2Path = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib`
    if (fs.existsSync(libGLESv2Path)) {
      console.log('Signing libGLESv2.dylib...')
      execSync(
        `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libGLESv2Path}"`,
        { stdio: 'inherit' },
      )
    }

    // libvk_swiftshader.dylib - Flagged in notarization log
    const libVkSwiftshaderPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib`
    if (fs.existsSync(libVkSwiftshaderPath)) {
      console.log('Signing libvk_swiftshader.dylib...')
      execSync(
        `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libVkSwiftshaderPath}"`,
        { stdio: 'inherit' },
      )
    }

    // libffmpeg.dylib - Flagged in notarization log
    const libFfmpegPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib`
    if (fs.existsSync(libFfmpegPath)) {
      console.log('Signing libffmpeg.dylib...')
      execSync(
        `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libFfmpegPath}"`,
        { stdio: 'inherit' },
      )
    }

    // Sign the Squirrel ShipIt executable
    const shipItPath = `${appPath}/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt`
    if (fs.existsSync(shipItPath)) {
      console.log('Signing Squirrel ShipIt...')
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${shipItPath}"`,
        { stdio: 'inherit' },
      )
    }

    // Sign all dylib files in Libraries directory
    const librariesDir = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries`
    if (fs.existsSync(librariesDir)) {
      console.log('Signing all remaining dylib files in Libraries directory...')
      const libraryFiles = fs.readdirSync(librariesDir)
      for (const library of libraryFiles) {
        if (library.endsWith('.dylib')) {
          const libraryPath = path.join(librariesDir, library)
          console.log(`Signing library: ${library}`)
          execSync(
            `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libraryPath}"`,
            { stdio: 'inherit' },
          )
        }
      }
    }

    // Sign the Electron Framework - Do this next
    console.log('Signing Electron Framework...')
    execSync(
      `codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${appPath}/Contents/Frameworks/Electron Framework.framework"`,
      { stdio: 'inherit' },
    )

    // Sign Squirrel framework specifically
    console.log('Signing Squirrel Framework...')
    const squirrelFrameworkPath = `${appPath}/Contents/Frameworks/Squirrel.framework`
    if (fs.existsSync(squirrelFrameworkPath)) {
      execSync(
        `codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${squirrelFrameworkPath}"`,
        { stdio: 'inherit' },
      )
    }

    // Sign all other frameworks
    console.log('Signing other frameworks...')
    const frameworksDir = `${appPath}/Contents/Frameworks`
    const frameworks = fs
      .readdirSync(frameworksDir)
      .filter(
        (item) =>
          item.endsWith('.framework') && item !== 'Electron Framework.framework' && item !== 'Squirrel.framework',
      )
      .map((item) => path.join(frameworksDir, item))

    for (const framework of frameworks) {
      console.log(`Signing framework: ${path.basename(framework)}`)
      execSync(`codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" "${framework}"`, {
        stdio: 'inherit',
      })
    }

    // Sign all helper apps
    console.log('Signing helper apps...')
    const helperApps = await glob(`${appPath}/Contents/Frameworks/*.app`)
    for (const helperApp of helperApps) {
      console.log(`Signing helper app: ${path.basename(helperApp)}`)
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${helperApp}"`,
        { stdio: 'inherit' },
      )
    }

    // Finally sign the main app
    console.log('Signing main app bundle...')
    execSync(
      `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${appPath}"`,
      { stdio: 'inherit' },
    )

    // Verify the signature
    console.log('Verifying signature...')
    execSync(`codesign --verify --deep --verbose=2 "${appPath}" || true`, { stdio: 'inherit' })

    console.log(`Successfully signed: ${appPath}`)
    return true
  } catch (error) {
    console.error(`Error signing app: ${error.message}`)
    return false
  }
}

// Helper: Notarize the macOS app
function notarizeMacOSApp(appPath, bundleId) {
  console.log(`Notarizing app: ${appPath}`)
  try {
    // Create a temporary zip for notarization (Apple recommends zip for app bundles)
    const tempZipPath = path.resolve(__dirname, '../app-to-notarize.zip')
    if (fs.existsSync(tempZipPath)) {
      fs.unlinkSync(tempZipPath)
    }

    console.log('Creating temporary zip for notarization...')
    execSync(`ditto -c -k --keepParent "${appPath}" "${tempZipPath}"`, { stdio: 'inherit' })

    // Submit for notarization
    console.log(`Submitting for notarization (this may take a while)...`)

    // Use notarytool submit with wait flag to submit and wait for results in one command
    const submitResult = execSync(
      `xcrun notarytool submit "${tempZipPath}" --keychain-profile "notarytool-profile" --wait`,
      { stdio: 'pipe', encoding: 'utf-8' },
    )

    console.log('Notarization submission result:')
    console.log(submitResult)

    // Check if the submission was successful by looking for "status: Accepted" in the output (case insensitive)
    const acceptedMatch = submitResult.match(/status:[\s]*(Accepted)/i)
    const statusMatch = submitResult.match(/status:[\s]*(\w+)/i)
    const status = statusMatch ? statusMatch[1] : 'Unknown'

    if (!acceptedMatch) {
      console.log(`Notarization not successful. Status: ${status}`)

      // Extract submission ID from the output
      const submissionIdMatch = submitResult.match(/id:[\s]+([a-f0-9-]+)/i)
      const submissionId = submissionIdMatch ? submissionIdMatch[1] : null

      if (submissionId) {
        // Get detailed log for the failed notarization
        const logPath = path.resolve(__dirname, '../notarization-log.json')
        console.log(`Getting detailed log for submission ID: ${submissionId}`)

        try {
          execSync(`xcrun notarytool log "${submissionId}" --keychain-profile "notarytool-profile" "${logPath}"`, {
            stdio: 'inherit',
          })

          console.log('Detailed notarization logs saved to notarization-log.json')

          // Try to read and display the top-level errors from the log
          try {
            const logContent = fs.readFileSync(logPath, 'utf-8')
            const logData = JSON.parse(logContent)

            if (logData.issues && logData.issues.length > 0) {
              console.log('\nNotarization issues found:')
              logData.issues.forEach((issue, index) => {
                console.log(`Issue ${index + 1}: ${issue.message} - Path: ${issue.path}`)
              })
            }
          } catch (logReadError) {
            console.log('Could not parse the notarization log file:', logReadError.message)
          }

          console.log('\nCommon notarization issues:')
          console.log('1. Info.plist missing required entries (CFBundleIdentifier, CFBundleVersion)')
          console.log('2. App not signed with hardened runtime')
          console.log('3. Missing entitlements for necessary capabilities')
          console.log('4. Signing problems with embedded binaries')

          throw new Error(`Notarization failed with status: ${status} - see log for details`)
        } catch (logError) {
          console.error(`Error getting notarization log: ${logError.message}`)
          throw new Error(`Notarization failed with status: ${status}`)
        }
      } else {
        throw new Error(`Notarization failed with status: ${status} and submission ID could not be determined`)
      }
    }

    // Remove the temporary zip
    fs.unlinkSync(tempZipPath)

    // Staple the notarization ticket to the app
    console.log(`Stapling notarization ticket to ${appPath}`)
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' })

    console.log(`Notarization and stapling successful for ${appPath}`)
    return true
  } catch (error) {
    console.error(`Notarization failed: ${error.message}`)
    console.error(
      'For help with notarization issues, visit: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution/resolving_common_notarization_issues',
    )
    return false
  }
}

// Helper: Verify and update Info.plist if needed
function verifyInfoPlist(appPath, bundleId) {
  console.log(`Verifying Info.plist in ${appPath}...`)
  const infoPlistPath = `${appPath}/Contents/Info.plist`

  if (!fs.existsSync(infoPlistPath)) {
    console.error(`Error: Info.plist not found at ${infoPlistPath}`)
    return false
  }

  try {
    // Read the current Info.plist values
    const currentBundleId = execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${infoPlistPath}"`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim()

    console.log(`Current bundle identifier: ${currentBundleId}`)

    // Update bundle ID if it doesn't match
    if (currentBundleId !== bundleId) {
      console.log(`Updating bundle identifier to ${bundleId}...`)
      execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${bundleId}" "${infoPlistPath}"`, {
        stdio: 'inherit',
      })
    }

    // Ensure other required properties exist
    try {
      execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "${infoPlistPath}"`, {
        stdio: 'pipe',
      })
    } catch (error) {
      console.log('CFBundleVersion not found, adding it...')
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string '1.0'" "${infoPlistPath}"`, {
        stdio: 'inherit',
      })
    }

    try {
      execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${infoPlistPath}"`, {
        stdio: 'pipe',
      })
    } catch (error) {
      console.log('CFBundleShortVersionString not found, adding it...')
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string '1.0'" "${infoPlistPath}"`, {
        stdio: 'inherit',
      })
    }

    console.log('Info.plist verification completed')
    return true
  } catch (error) {
    console.error(`Error verifying Info.plist: ${error.message}`)
    return false
  }
}

// Configuration for macOS builds
const version = process.env.npm_package_version || '1.1.0'
const macosBuilds = [
  {
    arch: 'x64',
    folder: `UniFi Protect Viewer-darwin-x64-${version}/UniFi Protect Viewer.app`,
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
  {
    arch: 'arm64',
    folder: `UniFi Protect Viewer-darwin-arm64-${version}/UniFi Protect Viewer.app`,
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
  {
    arch: 'universal',
    folder: `UniFi Protect Viewer-darwin-universal-${version}/UniFi Protect Viewer.app`,
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
]

// Main execution
console.log('Starting macOS app signing and notarization process...')

// Convert to an async IIFE (Immediately Invoked Function Expression)
;(async () => {
  let hasErrors = false
  let errorDetails = []

  for (const { arch, folder, bundleId } of macosBuilds) {
    const appBundlePath = path.join(buildsDir, folder)
    if (fs.existsSync(appBundlePath)) {
      console.log(`Processing ${arch} build...`)

      try {
        // Step 1: Verify and update Info.plist if needed
        if (!verifyInfoPlist(appBundlePath, bundleId)) {
          console.error(`Failed to verify Info.plist for ${appBundlePath}`)
          errorDetails.push(`Failed to verify Info.plist for ${arch} build`)
          hasErrors = true
          continue
        }

        // Step 2: Sign the app bundle
        const isSigned = await signMacOSApp(appBundlePath)

        if (isSigned) {
          console.log(`Successfully signed ${appBundlePath}`)

          // Step 3: Try to notarize the app, but continue even if it fails
          try {
            const isNotarized = notarizeMacOSApp(appBundlePath, bundleId)
            if (isNotarized) {
              console.log(`Successfully notarized ${appBundlePath}`)
            } else {
              console.warn(`⚠️ Notarization failed for ${appBundlePath}, but continuing with signing process`)
              errorDetails.push(`Notarization failed for ${arch} build`)
              hasErrors = true
            }
          } catch (notarizeError) {
            console.error(`Error during notarization: ${notarizeError.message}`)
            console.warn(`⚠️ Continuing with next build despite notarization failure`)
            errorDetails.push(`Notarization error for ${arch} build: ${notarizeError.message}`)
            hasErrors = true
          }
        } else {
          console.error(`Failed to sign ${appBundlePath}`)
          errorDetails.push(`Signing failed for ${arch} build`)
          hasErrors = true
        }
      } catch (error) {
        console.error(`Error processing ${arch} build: ${error.message}`)
        errorDetails.push(`Error processing ${arch} build: ${error.message}`)
        hasErrors = true
      }
    } else {
      console.warn(`App bundle not found: ${appBundlePath}`)
    }
  }

  if (hasErrors) {
    console.log('\n⚠️ Signing process completed with errors:')
    errorDetails.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`)
    })
    console.log('\nYou may still be able to use the signed apps for testing purposes.')
    console.log(
      'For distribution on the Mac App Store or via direct download, all builds must be properly signed and notarized.',
    )
  } else {
    console.log('\n✅ Signing and notarization process completed successfully.')
  }
})().catch((err) => {
  console.error('Unhandled error in signing process:', err)
  process.exit(1)
})
