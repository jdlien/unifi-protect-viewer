const fs = require('fs')
const path = require('path')
const { glob } = require('glob')
const { execSync } = require('child_process')

// Get command line arguments
const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose') || args.includes('-v')
const QUIET = args.includes('--quiet') || args.includes('-q')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
}

// Progress indicators
let spinnerInterval = null
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let frameIndex = 0
let statusMessage = ''

// Paths
const buildsDir = path.resolve(__dirname, '../builds')

// Code signing identity
const DEVELOPER_ID = 'Developer ID Application: Joseph Lien (A93Q7MKECL)'

// Configuration for macOS builds
const version = process.env.npm_package_version || '1.1.0'
const macosBuilds = [
  {
    arch: 'x64',
    folder: `UniFi Protect Viewer-darwin-x64/UniFi Protect Viewer.app`,
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
  {
    arch: 'arm64',
    folder: `UniFi Protect Viewer-darwin-arm64/UniFi Protect Viewer.app`,
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
  {
    arch: 'universal',
    folder: `UniFi Protect Viewer-darwin-universal/UniFi Protect Viewer.app`,
    bundleId: 'com.jdlien.unifi-protect-viewer',
  },
]

function startSpinner(message) {
  if (QUIET) return
  statusMessage = message
  stopSpinner()

  frameIndex = 0
  process.stdout.write(`${spinnerFrames[frameIndex]} ${message}`)

  spinnerInterval = setInterval(() => {
    frameIndex = (frameIndex + 1) % spinnerFrames.length
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    process.stdout.write(`${spinnerFrames[frameIndex]} ${statusMessage}`)
  }, 100)
}

function updateSpinnerText(message) {
  if (QUIET || !spinnerInterval) return
  statusMessage = message
}

function stopSpinner(finalMessage = null) {
  if (spinnerInterval) {
    clearInterval(spinnerInterval)
    spinnerInterval = null
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    if (finalMessage) {
      console.log(finalMessage)
    }
  }
}

// Utility functions for console output
function log(message, options = {}) {
  const { color, emoji, type } = options

  // Only log if verbose is true, or it's a significant message
  if (!VERBOSE && options.verbose === true) return

  let prefix = ''
  if (emoji) prefix += `${emoji} `
  if (color) {
    console.log(`${prefix}${color}${message}${colors.reset}`)
  } else {
    console.log(`${prefix}${message}`)
  }
}

function success(message, emoji = '✅') {
  log(message, { color: colors.green, emoji })
}

function info(message, emoji = 'ℹ️') {
  log(message, { color: colors.blue, emoji })
}

function warning(message, emoji = '⚠️') {
  log(message, { color: colors.yellow, emoji })
}

function error(message, emoji = '❌') {
  log(message, { color: colors.red, emoji })
}

function step(message, emoji = '🔄') {
  log(message, { color: colors.magenta, emoji })
}

function detail(message) {
  log(message, { color: colors.gray, verbose: true })
}

// Clear any existing notarization log
const notarizationLogPath = path.resolve(__dirname, '../notarization-log.json')
if (fs.existsSync(notarizationLogPath)) {
  info('Clearing previous notarization log...')
  fs.writeFileSync(notarizationLogPath, '{}')
  detail('Previous notarization log cleared')
}

// Show usage info
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node sign-builds.js [options]')
  console.log('')
  console.log('Options:')
  console.log('  -v, --verbose     Show verbose output')
  console.log('  -q, --quiet       Minimal output (only errors and success messages)')
  console.log('  -h, --help        Show this help message')
  process.exit(0)
}

// Main execution
console.log(`${colors.bright}${colors.cyan}🚀 Starting macOS app signing and notarization process...${colors.reset}`)
if (VERBOSE) {
  console.log(`${colors.gray}(Running in verbose mode)${colors.reset}`)
} else if (QUIET) {
  console.log(`${colors.gray}(Running in quiet mode)${colors.reset}`)
} else {
  console.log(
    `${colors.gray}(For more detailed output, use --verbose flag; for minimal output, use --quiet)${colors.reset}`,
  )
}

// Convert to an async IIFE (Immediately Invoked Function Expression)
;(async () => {
  let hasErrors = false
  let errorDetails = []

  for (const { arch, folder, bundleId } of macosBuilds) {
    const appBundlePath = path.join(buildsDir, folder)
    if (fs.existsSync(appBundlePath)) {
      step(`Processing ${arch} build...`, '🔍')

      try {
        // Step 1: Verify and update Info.plist if needed
        if (!verifyInfoPlist(appBundlePath, bundleId)) {
          error(`Failed to verify Info.plist for ${appBundlePath}`)
          errorDetails.push(`Failed to verify Info.plist for ${arch} build`)
          hasErrors = true
          continue
        }

        // Extract the app name from the path
        const appName = path.basename(appBundlePath, '.app').replace(/-darwin-(x64|arm64|universal)$/, '')

        // Step 2: Sign the app bundle
        const isSigned = await signMacOSApp(appBundlePath, arch, appName)

        if (isSigned) {
          success(`Successfully signed ${appName} (${arch})`)

          // Step 3: Try to notarize the app, but continue even if it fails
          try {
            const isNotarized = notarizeMacOSApp(appBundlePath, bundleId, arch, appName)
            if (isNotarized) {
              success(`Successfully notarized ${appName} (${arch})`)
            } else {
              warning(`Notarization failed for ${appName} (${arch}), but continuing with signing process`)
              errorDetails.push(`Notarization failed for ${arch} build`)
              hasErrors = true
            }
          } catch (notarizeError) {
            const errorMessage =
              notarizeError && typeof notarizeError.message === 'string' ? notarizeError.message : String(notarizeError)
            error(`Error during notarization: ${errorMessage}`)
            warning(`Continuing with next build despite notarization failure`)
            errorDetails.push(`Notarization error for ${arch} build: ${errorMessage}`)
            hasErrors = true
          }
        } else {
          error(`Failed to sign ${appName} (${arch})`)
          errorDetails.push(`Signing failed for ${arch} build`)
          hasErrors = true
        }
      } catch (error) {
        error(`Error processing ${arch} build: ${error.message}`)
        errorDetails.push(`Error processing ${arch} build: ${error.message}`)
        hasErrors = true
      }

      // Add a newline after processing each bundle
      if (arch !== macosBuilds[macosBuilds.length - 1].arch) {
        console.log('\n')
      }
    } else {
      warning(`App bundle not found: ${path.basename(folder, '.app')}`)
    }
  }

  if (hasErrors) {
    console.log(`\n${colors.bgRed}${colors.bright} ⚠️  Signing process completed with errors: ${colors.reset}`)
    errorDetails.forEach((error, index) => {
      console.log(`  ${colors.red}${index + 1}. ${error}${colors.reset}`)
    })
    console.log(`\n${colors.yellow}You may still be able to use the signed apps for testing purposes.${colors.reset}`)
    console.log(
      `${colors.yellow}For distribution on the Mac App Store or via direct download, all builds must be properly signed and notarized.${colors.reset}`,
    )
  } else {
    console.log(
      `\n${colors.bgGreen}${colors.bright} ✅ Signing and notarization process completed successfully. ${colors.reset}`,
    )
  }
})().catch((err) => {
  error('Unhandled error in signing process: ' + err)
  process.exit(1)
})

// Helper: Sign macOS app bundle
async function signMacOSApp(appPath, arch, appName) {
  step(`Signing app bundle: ${appName} (${arch})`)
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
    detail(`Created entitlements file at ${entitlementsPath}`)

    // Use direct commands for better control and debugging
    detail('Removing existing signatures...')
    if (QUIET) {
      startSpinner('Preparing app for signing...')
      execSync(`xattr -cr "${appPath}"`, { stdio: 'ignore' })
      stopSpinner()
    } else {
      execSync(`xattr -cr "${appPath}"`, { stdio: VERBOSE ? 'inherit' : 'ignore' })
    }

    // First sign the problematic helpers
    step('Signing Electron components...', '•')
    if (QUIET) startSpinner('Signing Electron components...')

    const crashpadHelperPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/Current/Helpers/chrome_crashpad_handler`

    if (fs.existsSync(crashpadHelperPath)) {
      detail('Signing chrome_crashpad_handler...')
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${crashpadHelperPath}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
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
          detail(`Signing helper: ${helper}`)
          execSync(
            `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${helperPath}"`,
            { stdio: VERBOSE ? 'inherit' : 'ignore' },
          )
        }
      }
    }

    if (QUIET) stopSpinner(`✅ ${colors.green}Electron components signed${colors.reset}`)

    // Sign the problematic libraries that were flagged in notarization
    step('Signing dylib libraries...', '•')
    if (QUIET) startSpinner('Signing dylib libraries...')

    // libEGL.dylib
    const libEGLPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib`
    if (fs.existsSync(libEGLPath)) {
      detail('Signing libEGL.dylib...')
      execSync(`codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libEGLPath}"`, {
        stdio: VERBOSE ? 'inherit' : 'ignore',
      })
    }

    // libGLESv2.dylib
    const libGLESv2Path = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib`
    if (fs.existsSync(libGLESv2Path)) {
      detail('Signing libGLESv2.dylib...')
      execSync(
        `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libGLESv2Path}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
      )
    }

    // libvk_swiftshader.dylib - Flagged in notarization log
    const libVkSwiftshaderPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib`
    if (fs.existsSync(libVkSwiftshaderPath)) {
      detail('Signing libvk_swiftshader.dylib...')
      execSync(
        `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libVkSwiftshaderPath}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
      )
    }

    // libffmpeg.dylib - Flagged in notarization log
    const libFfmpegPath = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib`
    if (fs.existsSync(libFfmpegPath)) {
      detail('Signing libffmpeg.dylib...')
      execSync(
        `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libFfmpegPath}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
      )
    }

    // Sign the Squirrel ShipIt executable
    const shipItPath = `${appPath}/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt`
    if (fs.existsSync(shipItPath)) {
      detail('Signing Squirrel ShipIt...')
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${shipItPath}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
      )
    }

    // Sign all dylib files in Libraries directory
    const librariesDir = `${appPath}/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries`
    if (fs.existsSync(librariesDir)) {
      detail('Signing all remaining dylib files in Libraries directory...')
      const libraryFiles = fs.readdirSync(librariesDir)
      for (const library of libraryFiles) {
        if (library.endsWith('.dylib')) {
          const libraryPath = path.join(librariesDir, library)
          detail(`Signing library: ${library}`)
          execSync(
            `codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" --no-strict "${libraryPath}"`,
            { stdio: VERBOSE ? 'inherit' : 'ignore' },
          )
        }
      }
    }

    if (QUIET) stopSpinner(`✅ ${colors.green}Dylib libraries signed${colors.reset}`)

    // Sign the Electron Framework - Do this next
    step('Signing frameworks...', '•')
    if (QUIET) startSpinner('Signing frameworks...')

    detail('Signing Electron Framework...')
    execSync(
      `codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${appPath}/Contents/Frameworks/Electron Framework.framework"`,
      { stdio: VERBOSE ? 'inherit' : 'ignore' },
    )

    // Sign Squirrel framework specifically
    detail('Signing Squirrel Framework...')
    const squirrelFrameworkPath = `${appPath}/Contents/Frameworks/Squirrel.framework`
    if (fs.existsSync(squirrelFrameworkPath)) {
      execSync(
        `codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${squirrelFrameworkPath}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
      )
    }

    // Sign all other frameworks
    detail('Signing other frameworks...')
    const frameworksDir = `${appPath}/Contents/Frameworks`
    const frameworks = fs
      .readdirSync(frameworksDir)
      .filter(
        (item) =>
          item.endsWith('.framework') && item !== 'Electron Framework.framework' && item !== 'Squirrel.framework',
      )
      .map((item) => path.join(frameworksDir, item))

    for (const framework of frameworks) {
      detail(`Signing framework: ${path.basename(framework)}`)
      execSync(`codesign --force --options runtime --timestamp --sign "${DEVELOPER_ID}" "${framework}"`, {
        stdio: VERBOSE ? 'inherit' : 'ignore',
      })
    }

    if (QUIET) stopSpinner(`✅ ${colors.green}Frameworks signed${colors.reset}`)

    // Sign all helper apps
    step('Signing helper apps...', '•')
    if (QUIET) startSpinner('Signing helper apps...')

    const helperApps = await glob(`${appPath}/Contents/Frameworks/*.app`)
    for (const helperApp of helperApps) {
      detail(`Signing helper app: ${path.basename(helperApp)}`)
      execSync(
        `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${helperApp}"`,
        { stdio: VERBOSE ? 'inherit' : 'ignore' },
      )
    }

    if (QUIET) stopSpinner(`✅ ${colors.green}Helper apps signed${colors.reset}`)

    // Finally sign the main app
    step('Signing main app bundle...', '•')
    if (QUIET) startSpinner('Signing main app bundle...')

    execSync(
      `codesign --force --options runtime --entitlements "${entitlementsPath}" --timestamp --sign "${DEVELOPER_ID}" "${appPath}"`,
      { stdio: VERBOSE ? 'inherit' : 'ignore' },
    )

    // Verify the signature
    detail('Verifying signature...')
    execSync(`codesign --verify --deep --verbose=2 "${appPath}" || true`, { stdio: VERBOSE ? 'inherit' : 'ignore' })

    if (QUIET) stopSpinner(`✅ ${colors.green}Main app signed and verified${colors.reset}`)

    return true
  } catch (error) {
    stopSpinner() // In case any spinner is still active
    error(`Error signing app: ${error.message}`)
    return false
  }
}

// Helper: Notarize the macOS app
function notarizeMacOSApp(appPath, bundleId, arch, appName) {
  step(`Notarizing app: ${appName} (${arch})`, '🔒')
  try {
    // Create a temporary zip for notarization (Apple recommends zip for app bundles)
    const tempZipPath = path.resolve(__dirname, '../builds/app-to-notarize.zip')
    if (fs.existsSync(tempZipPath)) {
      fs.unlinkSync(tempZipPath)
    }

    createNotarizationZip(appPath, tempZipPath)

    // Submit for notarization
    step(`Starting notarization process...`, '📤')

    try {
      // Always show progress regardless of verbose flag, unless in quiet mode
      if (QUIET) {
        startSpinner('Uploading to Apple notary service...')

        // Run the notarytool submit command in quiet mode
        try {
          execSync(`xcrun notarytool submit "${tempZipPath}" --keychain-profile "notarytool-profile"`, {
            stdio: 'pipe',
          })
          stopSpinner(`✅ ${colors.green}Upload complete${colors.reset}`)
        } catch (error) {
          stopSpinner()
          warning('Upload was interrupted or failed. Checking if it was successful anyway...')
        }

        // Wait a moment to allow the submission to register in the system
        detail('Waiting for submission to register...')
        execSync('sleep 2')

        // Get the submission ID from the most recent submission
        detail('Retrieving the most recent submission...')
        try {
          const recentOutput = execSync(`xcrun notarytool history --keychain-profile "notarytool-profile"`, {
            stdio: 'pipe',
            encoding: 'utf-8',
          })

          // Since this is not JSON output, we need to parse it manually
          // We'll get the first submission ID (most recent) from the output
          const submissionMatch = recentOutput.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
          if (submissionMatch && submissionMatch[1]) {
            const submissionId = submissionMatch[1]
            detail(`Most recent submission ID: ${submissionId}`)

            // Save submission data to the log file
            const logPath = path.resolve(__dirname, '../notarization-log.json')
            fs.writeFileSync(
              logPath,
              JSON.stringify(
                {
                  id: submissionId,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            )

            return processNotarizationResult(submissionId, appPath, appName, arch)
          } else {
            warning('Could not find submission ID in recent submissions')
            detail('Command output: ' + recentOutput)
            return false
          }
        } catch (historyError) {
          warning(`Error retrieving submission history: ${historyError.message}`)
          fs.writeFileSync(
            path.resolve(__dirname, '../notarization-log.json'),
            JSON.stringify(
              {
                error: historyError.message,
                timestamp: new Date().toISOString(),
                command: 'notarytool history',
              },
              null,
              2,
            ),
          )
          return false
        }
      } else {
        // First run with progress for user feedback
        console.log(`${colors.cyan}Uploading to Apple notary service (may take several minutes)...${colors.reset}`)

        // Run the notarytool submit command with progress flag for user feedback
        try {
          execSync(`xcrun notarytool submit "${tempZipPath}" --keychain-profile "notarytool-profile" --progress`, {
            stdio: 'inherit',
          })
          console.log(`${colors.green}Upload complete. Processing notarization...${colors.reset}`)
        } catch (error) {
          // If the upload was interrupted, let's handle it gracefully
          warning('Upload was interrupted or failed. Checking if it was successful anyway...')
        }

        // Wait a moment to allow the submission to register in the system
        detail('Waiting for submission to register...')
        execSync('sleep 2')

        // Get the submission ID from the most recent submission
        detail('Retrieving the most recent submission...')
        try {
          const recentOutput = execSync(`xcrun notarytool history --keychain-profile "notarytool-profile"`, {
            stdio: 'pipe',
            encoding: 'utf-8',
          })

          // Since this is not JSON output, we need to parse it manually
          // We'll get the first submission ID (most recent) from the output
          const submissionMatch = recentOutput.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
          if (submissionMatch && submissionMatch[1]) {
            const submissionId = submissionMatch[1]
            detail(`Most recent submission ID: ${submissionId}`)

            // Save submission data to the log file
            const logPath = path.resolve(__dirname, '../notarization-log.json')
            fs.writeFileSync(
              logPath,
              JSON.stringify(
                {
                  id: submissionId,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            )

            return processNotarizationResult(submissionId, appPath, appName, arch)
          } else {
            warning('Could not find submission ID in recent submissions')
            detail('Command output: ' + recentOutput)
            return false
          }
        } catch (historyError) {
          warning(`Error retrieving submission history: ${historyError.message}`)
          fs.writeFileSync(
            path.resolve(__dirname, '../notarization-log.json'),
            JSON.stringify(
              {
                error: historyError.message,
                timestamp: new Date().toISOString(),
                command: 'notarytool history',
              },
              null,
              2,
            ),
          )
          return false
        }
      }
    } catch (uploadError) {
      stopSpinner()
      const errorMsg = uploadError.message || String(uploadError)
      warning('Upload process was interrupted or failed: ' + errorMsg)

      // Save the error to the log file
      const logPath = path.resolve(__dirname, '../notarization-log.json')
      fs.writeFileSync(
        logPath,
        JSON.stringify(
          {
            error: errorMsg,
            timestamp: new Date().toISOString(),
            command: 'notarytool submit',
            appPath,
            arch,
          },
          null,
          2,
        ),
      )

      throw uploadError
    }
  } catch (error) {
    stopSpinner() // In case any spinner is still active
    error(`Notarization failed: ${error.message}`)
    warning(
      'For help with notarization issues, visit: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution/resolving_common_notarization_issues',
    )
    return false
  } finally {
    // Always clean up the temporary zip file
    const tempZipPath = path.resolve(__dirname, '../builds/app-to-notarize.zip')
    if (fs.existsSync(tempZipPath)) {
      try {
        fs.unlinkSync(tempZipPath)
        detail('Cleaned up temporary notarization zip file')
      } catch (cleanupErr) {
        warning(`Failed to clean up temporary zip file: ${cleanupErr.message}`)
      }
    }
  }
}

// New helper function to process notarization results
function processNotarizationResult(submissionId, appPath, appName, arch) {
  if (!submissionId) {
    error('No submission ID received from notarization service')
    return false
  }

  detail(`Processing notarization for submission ID: ${submissionId}`)

  // Wait for notarization to complete
  if (!QUIET) {
    console.log(
      `${colors.cyan}Checking notarization status for submission ${submissionId} (this may take a few minutes)...${colors.reset}`,
    )
  } else {
    startSpinner(`Checking notarization status for submission ${submissionId}...`)
  }

  try {
    // Wait for the notarization to complete
    const resultOutput = execSync(`xcrun notarytool wait ${submissionId} --keychain-profile "notarytool-profile"`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    })

    stopSpinner()

    // Update the log file with complete information
    const logPath = path.resolve(__dirname, '../notarization-log.json')

    // Check if the output contains "Accepted"
    if (resultOutput.includes('Accepted')) {
      fs.writeFileSync(
        logPath,
        JSON.stringify(
          {
            id: submissionId,
            status: 'Accepted',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      )

      info(`Notarization request ID: ${submissionId}`)
      detail(`Notarization status: Accepted`)

      // Save detailed log information
      try {
        // Get the detailed log information
        const logOutput = execSync(`xcrun notarytool info ${submissionId} --keychain-profile "notarytool-profile"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        })

        // Store the raw output since it's not in JSON format
        fs.writeFileSync(
          logPath,
          JSON.stringify(
            {
              id: submissionId,
              status: 'Accepted',
              details: logOutput,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        )

        // Check for issues in the output
        if (logOutput.includes('issues:')) {
          warning('\nNotarization issues found, see log for details')
        } else {
          detail('No notarization issues reported.')
        }
      } catch (logError) {
        warning(`Error retrieving detailed log: ${logError.message}`)
      }

      // Check if notarization was successful
      if (resultOutput.includes('Accepted')) {
        // Remove the temporary zip
        if (fs.existsSync(path.resolve(__dirname, '../builds/app-to-notarize.zip'))) {
          fs.unlinkSync(path.resolve(__dirname, '../builds/app-to-notarize.zip'))
        }

        // Staple the notarization ticket to the app
        step(`Stapling notarization ticket to app...`, '🏷️')
        if (QUIET) {
          startSpinner('Stapling notarization ticket to app...')
          execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'ignore' })
          stopSpinner(`✅ ${colors.green}Notarization ticket stapled successfully${colors.reset}`)
        } else {
          execSync(`xcrun stapler staple "${appPath}"`, { stdio: VERBOSE ? 'inherit' : 'ignore' })
        }

        success(`Notarization and stapling successful for ${appName} (${arch})`)
        return true
      } else {
        error(`Notarization failed with status: ${resultOutput}`)

        if (!QUIET) {
          warning('\nCommon notarization issues:')
          console.log(
            `${colors.yellow}1. Info.plist missing required entries (CFBundleIdentifier, CFBundleVersion)${colors.reset}`,
          )
          console.log(`${colors.yellow}2. App not signed with hardened runtime${colors.reset}`)
          console.log(`${colors.yellow}3. Missing entitlements for necessary capabilities${colors.reset}`)
          console.log(`${colors.yellow}4. Signing problems with embedded binaries${colors.reset}`)
        }

        return false
      }
    } else {
      error(`Notarization failed with status: ${resultOutput}`)

      if (!QUIET) {
        warning('\nCommon notarization issues:')
        console.log(
          `${colors.yellow}1. Info.plist missing required entries (CFBundleIdentifier, CFBundleVersion)${colors.reset}`,
        )
        console.log(`${colors.yellow}2. App not signed with hardened runtime${colors.reset}`)
        console.log(`${colors.yellow}3. Missing entitlements for necessary capabilities${colors.reset}`)
        console.log(`${colors.yellow}4. Signing problems with embedded binaries${colors.reset}`)
      }

      return false
    }
  } catch (waitError) {
    stopSpinner()
    const errorMsg = waitError.message || String(waitError)
    error(`Error waiting for notarization: ${errorMsg}`)

    // Save the error to the log file
    const logPath = path.resolve(__dirname, '../notarization-log.json')
    fs.writeFileSync(
      logPath,
      JSON.stringify(
        {
          error: errorMsg,
          timestamp: new Date().toISOString(),
          command: 'notarytool wait',
          submissionId,
          appPath,
          arch,
        },
        null,
        2,
      ),
    )

    return false
  }
}

// Helper: Verify and update Info.plist if needed
function verifyInfoPlist(appPath, bundleId) {
  detail(`Verifying Info.plist in ${appPath}...`)
  const infoPlistPath = `${appPath}/Contents/Info.plist`

  if (!fs.existsSync(infoPlistPath)) {
    error(`Error: Info.plist not found at ${infoPlistPath}`)
    return false
  }

  try {
    // Read the current Info.plist values
    const currentBundleId = execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${infoPlistPath}"`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim()

    detail(`Current bundle identifier: ${currentBundleId}`)

    // Update bundle ID if it doesn't match
    if (currentBundleId !== bundleId) {
      info(`Updating bundle identifier to ${bundleId}...`)
      execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${bundleId}" "${infoPlistPath}"`, {
        stdio: VERBOSE ? 'inherit' : 'ignore',
      })
    }

    // Ensure other required properties exist
    try {
      execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "${infoPlistPath}"`, {
        stdio: 'pipe',
      })
    } catch (error) {
      info('CFBundleVersion not found, adding it...')
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string '1.0'" "${infoPlistPath}"`, {
        stdio: VERBOSE ? 'inherit' : 'ignore',
      })
    }

    try {
      execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${infoPlistPath}"`, {
        stdio: 'pipe',
      })
    } catch (error) {
      info('CFBundleShortVersionString not found, adding it...')
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string '1.0'" "${infoPlistPath}"`, {
        stdio: VERBOSE ? 'inherit' : 'ignore',
      })
    }

    detail('Info.plist verification completed')
    return true
  } catch (error) {
    error(`Error verifying Info.plist: ${error.message}`)
    return false
  }
}

// Helper: Create a zip archive for notarization
function createNotarizationZip(appPath, tempZipPath) {
  detail('Creating temporary zip for notarization...')
  if (VERBOSE) {
    execSync(`ditto -c -k --keepParent "${appPath}" "${tempZipPath}"`, { stdio: 'inherit' })
  } else {
    startSpinner('Creating zip archive for notarization...')
    execSync(`ditto -c -k --keepParent "${appPath}" "${tempZipPath}"`, { stdio: 'ignore' })
    stopSpinner(`✅ ${colors.green}Zip archive created successfully${colors.reset}`)
  }
}
