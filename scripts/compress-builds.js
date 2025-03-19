const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const { glob } = require('glob')
const { execSync } = require('child_process')

// Get version from package.json
const version = process.env.npm_package_version || '1.1.0'

// Wrap the entire script in an async IIFE
;(async () => {
  // Paths
  const buildsDir = path.resolve(__dirname, '../builds')
  const releasesDir = path.resolve(__dirname, `../releases/${version}`)
  const platforms = ['macOS', 'Windows'] // Add any other platforms if needed

  // Ensure releases/version folder exists
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, { recursive: true })
  }

  // Helper: Delete files
  function deleteFile(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`Deleted: ${filePath}`)
    }
  }

  // Helper: Delete all .pak files except en-US.pak
  function cleanLocales(localeDir) {
    fs.readdirSync(localeDir).forEach((file) => {
      if (file !== 'en-US.pak') {
        deleteFile(path.join(localeDir, file))
      }
    })
  }

  // Helper: Zip directories
  function zipDirectory(sourceDir, outPath, customName = null, isAppBundle = false) {
    const output = fs.createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(`Created zip: ${outPath} (${archive.pointer()} total bytes)`)
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(output)

    const targetName = customName || path.basename(sourceDir) // Use customName or fallback to original

    // If it's a macOS .app bundle, zip the whole `.app` directory with the custom name
    if (isAppBundle) {
      archive.directory(sourceDir, `${targetName}.app`)
    } else {
      // For other builds, add the entire directory contents under the custom name
      archive.directory(sourceDir, targetName)
    }

    archive.finalize()
  }

  // Step 1: Remove LICENSES.chromium.html
  const files = await glob(`${buildsDir}/**/LICENSES.chromium.html`)

  files.forEach((file) => {
    fs.unlinkSync(file)
    console.log(`Deleted: ${file}`)
  })

  console.log('Removed all instances of LICENSES.chromium.html')

  // Step 2: Remove locales/*.pak except en-US.pak
  const localeDirs = [
    path.join(buildsDir, `UniFi Protect Viewer-unifi-protect-viewer-win32-x64-${version}/locales`),
    path.join(buildsDir, `UniFi Protect Viewer-unifi-protect-viewer-win32-ia32-${version}/locales`),
    path.join(buildsDir, `UniFi Protect Viewer-unifi-protect-viewer-win32-arm64-${version}/locales`),
    path.join(
      buildsDir,
      `UniFi Protect Viewer-darwin-x64-${version}/UniFi Protect Viewer.app/Contents/Resources/locales`,
    ),
    path.join(
      buildsDir,
      `UniFi Protect Viewer-darwin-arm64-${version}/UniFi Protect Viewer.app/Contents/Resources/locales`,
    ),
  ]

  localeDirs.forEach((localeDir) => {
    if (fs.existsSync(localeDir)) {
      cleanLocales(localeDir)
    }
  })

  // Compress macOS app bundles (assuming they are already signed and notarized)
  const macosBuilds = [
    {
      arch: 'x64',
      folder: `UniFi Protect Viewer-darwin-x64-${version}/UniFi Protect Viewer.app`,
      customName: 'UniFi Protect Viewer',
    },
    {
      arch: 'arm64',
      folder: `UniFi Protect Viewer-darwin-arm64-${version}/UniFi Protect Viewer.app`,
      customName: 'UniFi Protect Viewer',
    },
    {
      arch: 'universal',
      folder: `UniFi Protect Viewer-darwin-universal-${version}/UniFi Protect Viewer.app`,
      customName: 'UniFi Protect Viewer',
    },
  ]

  console.log('Compressing macOS app bundles...')

  macosBuilds.forEach(({ arch, folder, customName }) => {
    const appBundlePath = path.join(buildsDir, folder)
    if (fs.existsSync(appBundlePath)) {
      // Create the zip with the app
      const zipName = `UniFi.Protect.Viewer.${version}.macOS.${arch}.zip`
      const zipPath = path.join(releasesDir, zipName)
      zipDirectory(appBundlePath, zipPath, customName, true)
      console.log(`Compressed ${customName} for ${arch}`)
    } else {
      console.warn(`App bundle not found: ${appBundlePath}`)
    }
  })

  // Compress Windows builds
  console.log('Compressing Windows builds...')
  // Find all Windows builds
  const windowsBuildsPattern = `${buildsDir}/UniFi Protect Viewer-unifi-protect-viewer-win32-*-${version}`
  const windowsBuilds = await glob(windowsBuildsPattern)

  windowsBuilds.forEach((buildFolder) => {
    // Extract architecture from folder name (e.g., x64, ia32, arm64)
    const architecture = path.basename(buildFolder).split('win32-')[1].split('-')[0]
    const zipName = `UniFi.Protect.Viewer.${version}.Windows.${architecture}.zip`
    const zipPath = path.join(releasesDir, zipName)

    zipDirectory(buildFolder, zipPath, 'UniFi Protect Viewer') // Custom name for Windows folder
  })

  console.log('Windows builds compressed.')

  console.log('Compression completed.')
})().catch((err) => {
  console.error('Error in compression process:', err)
  process.exit(1)
})
