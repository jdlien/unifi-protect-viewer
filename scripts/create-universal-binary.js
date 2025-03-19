const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const packageJSON = JSON.parse(fs.readFileSync('package.json'))
const version = packageJSON.version || '1.1.0'
const buildsDir = path.resolve(__dirname, '../builds')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

console.log(`${colors.cyan}Creating Universal macOS binary...${colors.reset}`)

// Paths to the builds (before rename-builds.js runs)
const x64BuildPath = path.join(buildsDir, 'UniFi Protect Viewer-darwin-x64')
const arm64BuildPath = path.join(buildsDir, 'UniFi Protect Viewer-darwin-arm64')
const universalBuildPath = path.join(buildsDir, 'UniFi Protect Viewer-darwin-universal')

// Verify source builds exist
if (!fs.existsSync(x64BuildPath)) {
  console.error(`${colors.red}ERROR: x64 build not found at ${x64BuildPath}${colors.reset}`)
  process.exit(1)
}

if (!fs.existsSync(arm64BuildPath)) {
  console.error(`${colors.red}ERROR: arm64 build not found at ${arm64BuildPath}${colors.reset}`)
  process.exit(1)
}

// Create the universal directory
if (fs.existsSync(universalBuildPath)) {
  console.log(`${colors.yellow}Removing existing universal build directory...${colors.reset}`)
  try {
    execSync(`rm -rf "${universalBuildPath}"`, { stdio: 'inherit' })
  } catch (err) {
    console.error(`${colors.red}Failed to remove existing universal build directory: ${err.message}${colors.reset}`)
    process.exit(1)
  }
}

try {
  fs.mkdirSync(universalBuildPath, { recursive: true })
} catch (err) {
  console.error(`${colors.red}Failed to create universal build directory: ${err.message}${colors.reset}`)
  process.exit(1)
}

const universalAppPath = path.join(universalBuildPath, 'UniFi Protect Viewer.app')

// Copy the arm64 app as a base (structure will be the same)
// Using ditto instead of cp -R for better macOS app bundle handling
console.log(`${colors.green}Copying base app structure from arm64 build using ditto...${colors.reset}`)
try {
  execSync(`ditto "${arm64BuildPath}/UniFi Protect Viewer.app" "${universalAppPath}"`, { stdio: 'inherit' })
} catch (err) {
  console.error(`${colors.red}Failed to copy base app structure: ${err.message}${colors.reset}`)
  process.exit(1)
}

// Find all binary files that need to be combined
const binaryPaths = [
  {
    path: 'Contents/MacOS/UniFi Protect Viewer',
    type: 'executable',
  },
  {
    path: 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
    type: 'framework',
  },
  {
    path: 'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib',
    type: 'library',
  },
  {
    path: 'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib',
    type: 'library',
  },
  {
    path: 'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
    type: 'library',
  },
  {
    path: 'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib',
    type: 'library',
  },
  {
    path: 'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler',
    type: 'helper',
  },
]

// Helper apps to combine
const helperApps = [
  'Contents/Frameworks/UniFi Protect Viewer Helper.app/Contents/MacOS/UniFi Protect Viewer Helper',
  'Contents/Frameworks/UniFi Protect Viewer Helper (GPU).app/Contents/MacOS/UniFi Protect Viewer Helper (GPU)',
  'Contents/Frameworks/UniFi Protect Viewer Helper (Plugin).app/Contents/MacOS/UniFi Protect Viewer Helper (Plugin)',
  'Contents/Frameworks/UniFi Protect Viewer Helper (Renderer).app/Contents/MacOS/UniFi Protect Viewer Helper (Renderer)',
]

// Add helper apps to the binary paths
helperApps.forEach((helperPath) => {
  binaryPaths.push({
    path: helperPath,
    type: 'helper',
  })
})

// Create universal binaries for each binary file
let successCount = 0
let errorCount = 0

binaryPaths.forEach(({ path: binaryPath, type }) => {
  const x64Binary = `${x64BuildPath}/UniFi Protect Viewer.app/${binaryPath}`
  const arm64Binary = `${arm64BuildPath}/UniFi Protect Viewer.app/${binaryPath}`
  const universalBinary = `${universalAppPath}/${binaryPath}`

  // Only process if both source binaries exist
  if (fs.existsSync(x64Binary) && fs.existsSync(arm64Binary)) {
    console.log(`${colors.green}Creating universal binary for ${type}:${colors.reset} ${binaryPath}`)

    try {
      // Use lipo to combine the binaries
      execSync(`lipo -create -output "${universalBinary}" "${x64Binary}" "${arm64Binary}"`, { stdio: 'inherit' })

      // Make sure executables have proper permissions
      if (type === 'executable' || type === 'helper') {
        console.log(`${colors.yellow}Setting executable permissions for:${colors.reset} ${binaryPath}`)
        execSync(`chmod +x "${universalBinary}"`, { stdio: 'inherit' })
      }

      successCount++
    } catch (err) {
      console.error(`${colors.red}Error creating universal binary for ${binaryPath}: ${err.message}${colors.reset}`)
      errorCount++
    }
  } else {
    console.warn(`${colors.yellow}Skipping ${type} - one or both source binaries not found${colors.reset}`)
    if (!fs.existsSync(x64Binary)) {
      console.warn(`  ${colors.yellow}Missing x64 binary:${colors.reset} ${x64Binary}`)
    }
    if (!fs.existsSync(arm64Binary)) {
      console.warn(`  ${colors.yellow}Missing arm64 binary:${colors.reset} ${arm64Binary}`)
    }
  }
})

console.log(`\n${colors.cyan}Verifying architecture of main binary...${colors.reset}`)
try {
  execSync(`lipo -info "${universalAppPath}/Contents/MacOS/UniFi Protect Viewer"`, { stdio: 'inherit' })
} catch (err) {
  console.error(`${colors.red}Error verifying architecture: ${err.message}${colors.reset}`)
  process.exit(1)
}

if (errorCount > 0) {
  console.warn(`\n${colors.yellow}Universal macOS app created with ${errorCount} errors.${colors.reset}`)
} else {
  console.log(`\n${colors.green}Universal macOS app created successfully!${colors.reset}`)
}

console.log(`${colors.cyan}Location:${colors.reset} ${universalAppPath}`)
console.log(`${colors.yellow}Note: The universal app needs to be signed before distribution.${colors.reset}`)
