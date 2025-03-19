const fs = require('fs')
const path = require('path')
const { glob } = require('glob')
const { execSync } = require('child_process')

// Get version from package.json
const version = process.env.npm_package_version || '1.1.0'

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
}

// Paths
const buildsDir = path.resolve(__dirname, '../builds')

// Define files and directories to remove from different platforms
const commonRemovables = [
  // License files (keep one master copy somewhere if needed)
  '**/LICENSES.chromium.html',
  '**/LICENSE.txt',
  '**/LICENSE',
  '**/CREDITS.html',
  // Map files for debugging
  '**/*.map',
  // Debug files that aren't essential
  '**/*.debug',
  '**/*.pdb',
  // Default app files that are not needed
  '**/default_app.asar',
  // Source code files that aren't needed in production
  // Be careful with these as they might be part of native modules
  // '**/node_modules/**/*.ts',
  // '**/node_modules/**/*.coffee',
]

const macOSRemovables = [
  // Locales (keep only en-US if that's all you support)
  '**/Contents/Resources/locales/!(en-US).pak',
  // Unused resources
  '**/Contents/Resources/default_app.asar',
  // Debug symbols
  '**/*.dSYM',
  '**/*.pdb',
  // Unused frameworks or components
  '**/Contents/Frameworks/**/Resources/inspector',
  '**/Contents/Frameworks/Electron Framework.framework/Versions/*/Resources/inspector',
  // We're NOT removing any dylib files to avoid permission issues
  // '**/Contents/Frameworks/Electron Framework.framework/Versions/*/Libraries/!(libffmpeg|libvk_swiftshader|libEGL|libGLESv2).dylib',
  '**/Contents/Frameworks/Electron Framework.framework/**/*-symbol-file',
  // PDF extension files if not needed
  '**/Contents/Frameworks/Electron Framework.framework/Versions/*/Resources/pdf*.bundle',
  // Chrome dev tools if not needed in production
  '**/Contents/Frameworks/Electron Framework.framework/Versions/*/Resources/inspector',
  // Unused Node modules from unpacked asar
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/!(build|dist|lib)',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/!(build|dist|lib)/**',
  // Unnecessary documentation
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/docs/**',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/doc/**',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/example/**',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/examples/**',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/test/**',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/tests/**',
  '**/Contents/Resources/electron.asar.unpacked/node_modules/*/.github/**',
  // Typescript definition files
  '**/Contents/Resources/app.asar/**/*.d.ts',
  // Development-only files
  '**/Contents/Resources/app.asar/**/.npmignore',
  '**/Contents/Resources/app.asar/**/.travis.yml',
  '**/Contents/Resources/app.asar/**/.eslintrc*',
  '**/Contents/Resources/app.asar/**/tsconfig.json',
  // Source maps
  '**/Contents/Resources/app.asar/**/*.js.map',
]

const windowsRemovables = [
  // Locales
  '**/locales/!(en-US).pak',
  // Debug symbols
  '**/*.pdb',
  // Unused resources
  '**/resources/default_app.asar',
  // PDF extension files if not needed (but keep essential media DLLs)
  '**/pdf*.dll',
  '**/*.dll',
  '!**/ffmpeg.dll',
  '!**/vk_swiftshader.dll',
  '!**/d3dcompiler_47.dll',
  '!**/libEGL.dll',
  '!**/libGLESv2.dll',
  // Chrome dev tools if not needed in production
  '**/resources/inspector/**',
  // Unused Node modules from unpacked asar
  '**/resources/electron.asar.unpacked/node_modules/*/!(build|dist|lib)',
  '**/resources/electron.asar.unpacked/node_modules/*/!(build|dist|lib)/**',
  // Unnecessary documentation
  '**/resources/electron.asar.unpacked/node_modules/*/docs/**',
  '**/resources/electron.asar.unpacked/node_modules/*/doc/**',
  '**/resources/electron.asar.unpacked/node_modules/*/example/**',
  '**/resources/electron.asar.unpacked/node_modules/*/examples/**',
  '**/resources/electron.asar.unpacked/node_modules/*/test/**',
  '**/resources/electron.asar.unpacked/node_modules/*/tests/**',
  '**/resources/electron.asar.unpacked/node_modules/*/.github/**',
  // Typescript definition files
  '**/resources/app.asar/**/*.d.ts',
  // Development-only files
  '**/resources/app.asar/**/.npmignore',
  '**/resources/app.asar/**/.travis.yml',
  '**/resources/app.asar/**/.eslintrc*',
  '**/resources/app.asar/**/tsconfig.json',
  // Source maps
  '**/resources/app.asar/**/*.js.map',
  // Native modules for unused platforms (if any exist)
  '**/resources/app.asar.unpacked/**/*(mac|darwin|osx)*.node',
]

// Helper: Delete a single file
function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  } catch (err) {
    console.error(`${colors.red}Error deleting file ${filePath}:${colors.reset}`, err.message)
  }
  return false
}

// Helper: Recursively delete a directory
function deleteDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true })
      return true
    }
  } catch (err) {
    console.error(`${colors.red}Error deleting directory ${dirPath}:${colors.reset}`, err.message)
  }
  return false
}

// Helper: Get file size in human-readable format
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath)
    const fileSizeInBytes = stats.size
    const units = ['B', 'KB', 'MB', 'GB']
    let fileSize = fileSizeInBytes
    let unitIndex = 0

    while (fileSize > 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024
      unitIndex++
    }

    return `${fileSize.toFixed(2)} ${units[unitIndex]}`
  } catch (err) {
    return 'Unknown size'
  }
}

// Helper: Get directory size in human-readable format
function getDirectorySize(dirPath) {
  try {
    const command =
      process.platform === 'darwin' || process.platform === 'linux'
        ? `du -sh "${dirPath}" | cut -f1`
        : `powershell -command "(Get-ChildItem -Path '${dirPath}' -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB"`

    const result = execSync(command, { encoding: 'utf8' }).trim()
    return result
  } catch (err) {
    return 'Unknown size'
  }
}

// Helper: Print removal summary
function printRemovalSummary(files, directories, savedSpace) {
  console.log(`\n${colors.green}=== Removal Summary ===${colors.reset}`)
  console.log(`${colors.yellow}Files removed:${colors.reset} ${files}`)
  console.log(`${colors.yellow}Directories removed:${colors.reset} ${directories}`)
  console.log(`${colors.green}Approximate space saved:${colors.reset} ${savedSpace}\n`)
}

// Main function to thin the builds
async function thinBuilds() {
  console.log(`\n${colors.bright}${colors.cyan}🔪 Starting app bundle thinning process...${colors.reset}\n`)

  let totalFilesRemoved = 0
  let totalDirsRemoved = 0
  let totalSizeBefore = 0
  let totalSizeAfter = 0

  // Get all build directories
  const macOSBuildPaths = await glob(`${buildsDir}/UniFi Protect Viewer-darwin-*`)
  const windowsBuildPaths = await glob(`${buildsDir}/unifi-protect-viewer-win32-*`)

  // Process macOS builds
  if (macOSBuildPaths.length > 0) {
    console.log(`${colors.magenta}Processing ${macOSBuildPaths.length} macOS builds...${colors.reset}`)

    for (const buildPath of macOSBuildPaths) {
      const archName = path.basename(buildPath).split('-darwin-')[1]
      console.log(`\n${colors.cyan}Thinning macOS ${archName} build at:${colors.reset} ${buildPath}`)

      // Get size before
      const sizeBefore = getDirectorySize(buildPath)
      console.log(`${colors.yellow}Size before:${colors.reset} ${sizeBefore}`)

      let filesRemoved = 0
      let dirsRemoved = 0

      // Process common removables
      for (const pattern of [...commonRemovables, ...macOSRemovables]) {
        try {
          const matches = await glob(`${buildPath}/${pattern}`)

          for (const match of matches) {
            const stats = fs.statSync(match)

            if (stats.isDirectory()) {
              if (deleteDirectory(match)) {
                console.log(`${colors.gray}Removed directory:${colors.reset} ${path.relative(buildPath, match)}`)
                dirsRemoved++
              }
            } else {
              if (deleteFile(match)) {
                filesRemoved++
                if (filesRemoved % 10 === 0) {
                  process.stdout.write('.')
                }
              }
            }
          }
        } catch (err) {
          console.error(`${colors.red}Error processing pattern ${pattern}:${colors.reset}`, err.message)
        }
      }

      // Get size after
      const sizeAfter = getDirectorySize(buildPath)
      console.log(`\n${colors.yellow}Size after:${colors.reset} ${sizeAfter}`)

      printRemovalSummary(filesRemoved, dirsRemoved, `${sizeBefore} -> ${sizeAfter}`)

      totalFilesRemoved += filesRemoved
      totalDirsRemoved += dirsRemoved
    }
  } else {
    console.log(`${colors.yellow}No macOS builds found.${colors.reset}`)
  }

  // Process Windows builds
  if (windowsBuildPaths.length > 0) {
    console.log(`${colors.magenta}Processing ${windowsBuildPaths.length} Windows builds...${colors.reset}`)

    for (const buildPath of windowsBuildPaths) {
      const archName = path.basename(buildPath).split('win32-')[1]
      console.log(`\n${colors.cyan}Thinning Windows ${archName} build at:${colors.reset} ${buildPath}`)

      // Get size before
      const sizeBefore = getDirectorySize(buildPath)
      console.log(`${colors.yellow}Size before:${colors.reset} ${sizeBefore}`)

      let filesRemoved = 0
      let dirsRemoved = 0

      // Process common removables
      for (const pattern of [...commonRemovables, ...windowsRemovables]) {
        try {
          const matches = await glob(`${buildPath}/${pattern}`)

          for (const match of matches) {
            const stats = fs.statSync(match)

            if (stats.isDirectory()) {
              if (deleteDirectory(match)) {
                console.log(`${colors.gray}Removed directory:${colors.reset} ${path.relative(buildPath, match)}`)
                dirsRemoved++
              }
            } else {
              if (deleteFile(match)) {
                filesRemoved++
                if (filesRemoved % 10 === 0) {
                  process.stdout.write('.')
                }
              }
            }
          }
        } catch (err) {
          console.error(`${colors.red}Error processing pattern ${pattern}:${colors.reset}`, err.message)
        }
      }

      // Get size after
      const sizeAfter = getDirectorySize(buildPath)
      console.log(`\n${colors.yellow}Size after:${colors.reset} ${sizeAfter}`)

      printRemovalSummary(filesRemoved, dirsRemoved, `${sizeBefore} -> ${sizeAfter}`)

      totalFilesRemoved += filesRemoved
      totalDirsRemoved += dirsRemoved
    }
  } else {
    console.log(`${colors.yellow}No Windows builds found.${colors.reset}`)
  }

  // Print overall summary
  console.log(`\n${colors.bgGreen}${colors.bright} ✅ Build thinning completed: ${colors.reset}`)
  console.log(`${colors.green}Total files removed:${colors.reset} ${totalFilesRemoved}`)
  console.log(`${colors.green}Total directories removed:${colors.reset} ${totalDirsRemoved}`)
}

// Run the main function
thinBuilds().catch((err) => {
  console.error(`${colors.bgRed}${colors.bright} ❌ Error in thinning process: ${colors.reset}`, err)
  process.exit(1)
})
