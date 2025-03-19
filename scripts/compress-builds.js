const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const { glob } = require('glob')
const { execSync } = require('child_process')

// Wrap the entire script in an async IIFE
;(async () => {
  // Paths
  const buildsDir = path.resolve(__dirname, '../builds')
  const releasesDir = path.resolve(__dirname, `../releases/${process.env.npm_package_version}`)
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
  function zipDirectory(sourceDir, outPath) {
    const output = fs.createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(`Created zip: ${outPath} (${archive.pointer()} total bytes)`)
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(output)
    archive.directory(sourceDir, false)
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
    path.join(buildsDir, 'unifi-protect-viewer-linux-x64/locales'),
    path.join(buildsDir, 'unifi-protect-viewer-win32-x64/locales'),
    path.join(buildsDir, 'UniFi Protect Viewer-darwin-x64/UniFi Protect Viewer.app/Contents/Resources/locales'),
    path.join(buildsDir, 'UniFi Protect Viewer-darwin-arm64/UniFi Protect Viewer.app/Contents/Resources/locales'),
  ]

  localeDirs.forEach((localeDir) => {
    if (fs.existsSync(localeDir)) {
      cleanLocales(localeDir)
    }
  })

  // Helper: Zip directories, with custom folder names for user-friendly naming
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

  // Compress macOS app bundles (assuming they are already signed and notarized)
  const macosBuilds = [
    {
      arch: 'x64',
      folder: 'UniFi Protect Viewer-darwin-x64/UniFi Protect Viewer.app',
      customName: 'UniFi Protect Viewer',
    },
    {
      arch: 'arm64',
      folder: 'UniFi Protect Viewer-darwin-arm64/UniFi Protect Viewer.app',
      customName: 'UniFi Protect Viewer',
    },
  ]

  console.log('Compressing macOS app bundles...')

  macosBuilds.forEach(({ arch, folder, customName }) => {
    const appBundlePath = path.join(buildsDir, folder)
    if (fs.existsSync(appBundlePath)) {
      // Create the zip with the app
      const zipName = `UniFi.Protect.Viewer.${process.env.npm_package_version}.macOS.${arch}.zip`
      const zipPath = path.join(releasesDir, zipName)
      zipDirectory(appBundlePath, zipPath, customName, true)
      console.log(`Compressed ${customName} for ${arch}`)
    } else {
      console.warn(`App bundle not found: ${appBundlePath}`)
    }
  })

  // Compress Windows builds
  console.log('Compressing Windows builds...')
  const windowsBuilds = await glob(`${buildsDir}/unifi-protect-viewer-win32-*`)

  windowsBuilds.forEach((buildFolder) => {
    const architecture = path.basename(buildFolder).split('-').pop() // Extract architecture (e.g., x64, ia32, arm64)
    const zipName = `UniFi.Protect.Viewer.${process.env.npm_package_version}.Windows.${architecture}.zip`
    const zipPath = path.join(releasesDir, zipName)

    zipDirectory(buildFolder, zipPath, 'UniFi Protect Viewer') // Custom name for Windows folder
  })

  console.log('Windows builds compressed.')

  console.log('Compression completed.')
})().catch((err) => {
  console.error('Error in compression process:', err)
  process.exit(1)
})
