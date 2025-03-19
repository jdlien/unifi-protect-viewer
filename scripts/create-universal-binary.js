const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const packageJSON = JSON.parse(fs.readFileSync('package.json'))
const version = packageJSON.version || '1.1.0'
const buildsDir = path.resolve(__dirname, '../builds')

console.log('Creating Universal macOS binary...')

// Paths to the builds (before rename-builds.js runs)
const x64BuildPath = path.join(buildsDir, 'UniFi Protect Viewer-darwin-x64')
const arm64BuildPath = path.join(buildsDir, 'UniFi Protect Viewer-darwin-arm64')
const universalBuildPath = path.join(buildsDir, 'UniFi Protect Viewer-darwin-universal')

// Create the universal directory
if (!fs.existsSync(universalBuildPath)) {
  fs.mkdirSync(universalBuildPath, { recursive: true })
}

// Copy the arm64 app as a base (structure will be the same)
console.log('Copying base app structure from arm64 build...')
execSync(`cp -R "${arm64BuildPath}/UniFi Protect Viewer.app" "${universalBuildPath}/"`, { stdio: 'inherit' })

const universalAppPath = path.join(universalBuildPath, 'UniFi Protect Viewer.app')

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
binaryPaths.forEach(({ path: binaryPath, type }) => {
  const x64Binary = `${x64BuildPath}/UniFi Protect Viewer.app/${binaryPath}`
  const arm64Binary = `${arm64BuildPath}/UniFi Protect Viewer.app/${binaryPath}`
  const universalBinary = `${universalAppPath}/${binaryPath}`

  // Only process if both source binaries exist
  if (fs.existsSync(x64Binary) && fs.existsSync(arm64Binary)) {
    console.log(`Creating universal binary for ${type}: ${binaryPath}`)

    // Use lipo to combine the binaries
    execSync(`lipo -create -output "${universalBinary}" "${x64Binary}" "${arm64Binary}"`, { stdio: 'inherit' })
  } else {
    console.warn(`Skipping ${type} - one or both source binaries not found`)
  }
})

console.log('\nVerifying architecture of main binary...')
execSync(`lipo -info "${universalAppPath}/Contents/MacOS/UniFi Protect Viewer"`, { stdio: 'inherit' })

console.log('\nUniversal macOS app created successfully!')
console.log(`Location: ${universalAppPath}`)
console.log('Note: The universal app needs to be signed before distribution.')
