const fs = require('fs')
const path = require('path')
const glob = require('glob')
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
function signMacOSApp(appPath) {
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

    // Sign the Squirrel ShipIt executable
    const shipItPath = `${appPath}/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt`
    if (fs.existsSync(shipItPath)) {
      console.log('Signing Squirrel ShipIt...')
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${shipItPath}"`,
        { stdio: 'inherit' },
      )
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
    const helperApps = glob.sync(`${appPath}/Contents/Frameworks/*.app`)
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

    // Submit for notarization with additional options
    console.log(`Submitting for notarization (this may take a while)...`)

    // Step 1: Show upload progress by using inherit for stdio
    execSync(`xcrun notarytool submit "${tempZipPath}" --keychain-profile "notarytool-profile" --wait`, {
      stdio: 'inherit',
    })

    // Step 2: Get the submission ID by requesting the most recent submission
    console.log('Getting submission info...')
    const submissionInfo = execSync(`xcrun notarytool history --keychain-profile "notarytool-profile" --limit 1`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    })

    const submissionIdMatch = submissionInfo.match(/id:[\s]+([a-f0-9-]+)/)
    const statusMatch = submissionInfo.match(/status:[\s]+(\w+)/)

    const submissionId = submissionIdMatch ? submissionIdMatch[1] : null
    const status = statusMatch ? statusMatch[1] : null

    console.log(`Recent submission ID: ${submissionId || 'Unknown'}`)
    console.log(`Submission status: ${status || 'Unknown'}`)

    // Check if notarization was successful
    if (status !== 'Accepted') {
      console.log('Notarization not successful. Fetching detailed logs...')

      if (submissionId) {
        // Get detailed log for the failed notarization
        const logPath = path.resolve(__dirname, '../notarization-log.json')
        execSync(`xcrun notarytool log ${submissionId} --keychain-profile "notarytool-profile" ${logPath}`, {
          stdio: 'inherit',
        })

        console.log('Detailed notarization logs saved to notarization-log.json')
        console.log('Please check this file to see why notarization failed.')

        console.log('\nCommon notarization issues:')
        console.log('1. Info.plist missing required entries (CFBundleIdentifier, CFBundleVersion)')
        console.log('2. App not signed with hardened runtime')
        console.log('3. Missing entitlements for necessary capabilities')
        console.log('4. Signing problems with embedded binaries')

        throw new Error('Notarization failed - see log for details')
      } else {
        throw new Error('Notarization failed and submission ID could not be determined')
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
const macosBuilds = [
  {
    arch: 'x64',
    folder: 'UniFi Protect Viewer-darwin-x64/UniFi Protect Viewer.app',
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
  {
    arch: 'arm64',
    folder: 'UniFi Protect Viewer-darwin-arm64/UniFi Protect Viewer.app',
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
]

// Main execution
console.log('Starting macOS app signing and notarization process...')

macosBuilds.forEach(({ arch, folder, bundleId }) => {
  const appBundlePath = path.join(buildsDir, folder)
  if (fs.existsSync(appBundlePath)) {
    console.log(`Processing ${arch} build...`)

    // Step 1: Verify and update Info.plist if needed
    if (!verifyInfoPlist(appBundlePath, bundleId)) {
      console.error(`Failed to verify Info.plist for ${appBundlePath}`)
      return
    }

    // Step 2: Sign the app bundle
    const isSigned = signMacOSApp(appBundlePath)

    if (isSigned) {
      // Step 3: Notarize the app
      const isNotarized = notarizeMacOSApp(appBundlePath, bundleId)

      if (isNotarized) {
        console.log(`Successfully signed and notarized ${appBundlePath}`)
      } else {
        console.error(`Failed to notarize ${appBundlePath}`)
      }
    } else {
      console.error(`Failed to sign ${appBundlePath}`)
    }
  } else {
    console.warn(`App bundle not found: ${appBundlePath}`)
  }
})

console.log('Signing and notarization process completed.')
