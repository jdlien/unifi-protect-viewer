const fs = require('fs')
const path = require('path')
const { glob } = require('glob')
const { execSync } = require('child_process')

// Paths
const rootDir = path.resolve(__dirname, '..')

// Add a log file path
const logFilePath = path.resolve(rootDir, 'thinning-log.txt')

// Clear the log file at the start
fs.writeFileSync(logFilePath, '')

// Process command line arguments
const args = process.argv.slice(2)
const MINIMAL_MODE = args.includes('--minimal') || args.includes('-m')
const VERBOSE = args.includes('--verbose') || args.includes('-v') || args.includes('--debug') || args.includes('-d')
const SKIP_UNIVERSAL = args.includes('--skip-universal')

// Add debug mode for extra verbose logging
const DEBUG = args.includes('--debug') || args.includes('-d')

// Get version from package.json
const packageJson = require('../package.json')
const appVersion = packageJson.version
const appName = packageJson.productName || packageJson.name

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
const buildsDir = path.resolve(rootDir, 'builds')
const buildDir = buildsDir // For compatibility with both variable names

// Helper: Log message to file
function logToFile(message) {
  fs.appendFileSync(logFilePath, message + '\n')
}

// Define files and directories to remove from different platforms
const commonRemovables = [
  // License files (keep one master copy somewhere if needed)
  '**/LICENSES.chromium.html',
  '**/LICENSE',
  // The following patterns had minimal impact and have been removed:
  // '**/LICENSE.txt',
  // '**/CREDITS.html',
  // '**/default_app.asar',
  // '**/*.map',
  // '**/*.debug',
  // '**/*.pdb',
]

const macOSRemovables = [
  // Locales (keep only en-US if that's all you support)
  '**/Contents/Resources/locales/!(en-US).pak',
]

const windowsRemovables = [
  // Locales
  '**/locales/!(en-US).pak',
  // DLL files - significant space savings
  '**/*.dll',
  '!**/ffmpeg.dll',
  '!**/vk_swiftshader.dll',
  '!**/d3dcompiler_47.dll',
  '!**/libEGL.dll',
  '!**/libGLESv2.dll',
]

// Additional safe removables specifically for universal binaries
// These are files that are known to be safe to remove from universal builds
const universalMacOSRemovables = [
  // Extra locale files (keep only en-US)
  '**/Contents/Resources/locales/!(en-US).pak',

  // Crash reporter resources that are duplicated
  '**/Contents/Frameworks/Electron Framework.framework/Resources/crashpad_handler', // COULD POTENTIALLY CAUSE ISSUES WITH UNIVERSAL BUILD - might remove crash handlers

  // Extra language resources
  '**/Contents/Resources/*.lproj/!(MainMenu.nib)',
  '**/Contents/Resources/!(en*).lproj',

  // Font cache files that will be regenerated
  '**/Contents/Frameworks/**/*.fontcache',

  // Unused Electron demos and examples
  '**/Contents/Resources/electron/common/api/demos/**',

  // Additional cache files
  '**/*.cache',

  // Image assets used only during development
  '**/Contents/Resources/electron.asar/**/*.png',
  '**/Contents/Resources/electron.asar/**/*.jpg',
  '**/Contents/Resources/electron.asar/**/*.svg',

  // Documentation files - only safe ones
  '**/Contents/Resources/electron.asar/**/README.md',
  '**/Contents/Resources/electron.asar/**/CHANGELOG.md',
  '**/Contents/Resources/electron.asar/**/CONTRIBUTING.md',

  // VSCode files that might have been included
  '**/.vscode/**',
  '**/.vs/**',
  // Git files
  '**/.git/**',
  '**/.github/**',
  '**/.gitignore',
  '**/.gitattributes',
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

// Special optimization for universal binaries to further reduce size
async function optimizeUniversalBinary(buildPath) {
  // Only apply this to universal binaries
  if (!buildPath.includes('-universal')) {
    return { filesRemoved: 0, dirsRemoved: 0 }
  }

  console.log(`\n${colors.cyan}Applying additional universal binary optimizations...${colors.reset}`)

  let filesRemoved = 0
  let dirsRemoved = 0

  try {
    // 1. Remove extra architecture-specific resource files
    // These patterns target files that might be duplicated across architectures
    const universalSpecificPatterns = [
      // Duplicated resource files - more conservative list
      '**/Contents/Frameworks/**/*.nib',
      '**/Contents/Frameworks/**/*.strings',

      // // Additional universal-specific optimizations
      '**/Contents/Frameworks/**/*.so',
      // REMOVING **/Contents/Frameworks/**/*.bin' and *.dat CAUSES ISSUES WITH UNIVERSAL BUILD - removes binary files needed at runtime

      '**/Contents/Resources/electron.asar/**/*.png',
      '**/Contents/Resources/electron.asar/**/*.jpg',
      '**/Contents/Resources/electron.asar/**/*.gif',

      // Documentation files - only safe ones
      '**/Contents/Resources/electron.asar/**/README.md',
      '**/Contents/Resources/electron.asar/**/CHANGELOG.md',
      '**/Contents/Resources/electron.asar/**/CONTRIBUTING.md',

      // VSCode files that might have been included
      '**/.vscode/**',
      '**/.vs/**',
      // Git files
      '**/.git/**',
      '**/.github/**',
      '**/.gitignore',
      '**/.gitattributes',
    ]

    for (const pattern of universalSpecificPatterns) {
      try {
        // Add exclusions to prevent removing critical files
        const matches = await glob(`${buildPath}/${pattern}`)

        if (VERBOSE && matches.length > 0) {
          console.log(`Pattern ${colors.yellow}${pattern}${colors.reset} matched ${matches.length} files/dirs`)
        }

        for (const match of matches) {
          // Skip files that might be critical
          if (
            match.includes('package.json') ||
            match.includes('manifest.json') ||
            match.includes('en-US') ||
            match.includes('index.') ||
            match.includes('/api/') ||
            match.includes('/lib/') ||
            match.includes('.asar') || // Add extra protection for asar files
            match.includes('node_modules') // Add protection for node_modules
          ) {
            if (VERBOSE) {
              console.log(`${colors.yellow}Skipping critical file:${colors.reset} ${path.relative(buildPath, match)}`)
            }
            continue
          }

          // Check file size - only optimize larger files to avoid wasting time on tiny files
          const stats = fs.statSync(match)
          if (stats.size < 5000) {
            // Skip files smaller than 5 KB
            continue
          }

          if (stats.isDirectory()) {
            if (deleteDirectory(match)) {
              console.log(
                `${colors.gray}Removed universal directory:${colors.reset} ${path.relative(buildPath, match)}`,
              )
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
        console.error(`${colors.red}Error processing universal pattern ${pattern}:${colors.reset}`, err.message)
      }
    }

    // 2. Optimize icon resources which are often duplicated
    console.log('\nOptimizing icon resources...')
    const iconPatterns = ['**/Contents/Resources/**/*.icns', '**/Contents/Resources/**/*.ico']

    for (const pattern of iconPatterns) {
      const matches = await glob(`${buildPath}/${pattern}`)

      // Keep only the main app icon and remove duplicates
      for (const match of matches) {
        if (!match.includes('electron.icns') && !match.includes('icon.icns')) {
          if (deleteFile(match)) {
            console.log(`${colors.gray}Removed duplicate icon:${colors.reset} ${path.relative(buildPath, match)}`)
            filesRemoved++
          }
        }
      }
    }

    if (filesRemoved > 0 || dirsRemoved > 0) {
      console.log(`\n${colors.green}Universal binary optimization complete.${colors.reset}`)
      console.log(`${colors.yellow}Additional files removed:${colors.reset} ${filesRemoved}`)
      console.log(`${colors.yellow}Additional directories removed:${colors.reset} ${dirsRemoved}`)
    } else {
      console.log(`\n${colors.yellow}No additional files removed during universal optimization.${colors.reset}`)
    }

    return { filesRemoved, dirsRemoved }
  } catch (err) {
    console.error(`${colors.red}Error during universal binary optimization:${colors.reset}`, err.message)
    return { filesRemoved: 0, dirsRemoved: 0 }
  }
}

// Helper: Calculate directory size
async function calculateDirSize(dirPath) {
  let totalSize = 0

  const files = fs.readdirSync(dirPath)

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const stats = fs.statSync(filePath)

    if (stats.isDirectory()) {
      totalSize += await calculateDirSize(filePath)
    } else {
      totalSize += stats.size
    }
  }

  return totalSize
}

// Helper: Format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes'
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

// Helper: Process removable files and directories
async function processRemovables(buildPath, removables) {
  let filesRemoved = 0
  let dirsRemoved = 0

  console.log(`Processing ${removables.length} removal patterns...`)

  for (const pattern of removables) {
    try {
      if (DEBUG) {
        console.log(`Checking pattern: ${pattern}`)
      }

      // Use glob with the correct syntax
      const matches = await glob(`${buildPath}/${pattern}`)

      if (VERBOSE && matches.length > 0) {
        console.log(`Pattern ${colors.yellow}${pattern}${colors.reset} matched ${matches.length} files/dirs`)
      }

      let patternSizeBefore = 0

      for (const match of matches) {
        if (DEBUG) {
          console.log(`Processing match: ${match}`)
        }

        const stats = fs.statSync(match)
        patternSizeBefore += stats.size

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

      const savedSpace = patternSizeBefore
      logToFile(`Pattern: ${pattern}, Space saved: ${formatSize(savedSpace)}`)
    } catch (err) {
      console.error(`${colors.red}Error processing pattern ${pattern}:${colors.reset}`, err.message)
    }
  }

  return { filesRemoved, dirsRemoved }
}

// Main function to thin the builds
async function thinBuilds() {
  // Get build directories
  console.log(`\n${colors.green}Starting build thinning process for ${appName} v${appVersion}${colors.reset}`)

  let totalSizeBefore = 0
  let totalSizeAfter = 0
  let totalFilesRemoved = 0
  let totalDirsRemoved = 0

  try {
    // Start with macOS builds
    console.log(`\n${colors.cyan}Processing macOS builds...${colors.reset}`)
    const macOSBuilds = await glob(`${buildsDir}/*darwin*`)

    if (macOSBuilds.length === 0) {
      console.log(`${colors.yellow}No macOS builds found${colors.reset}`)
    }

    for (const build of macOSBuilds) {
      console.log(`\n${colors.green}Processing macOS build: ${colors.yellow}${path.basename(build)}${colors.reset}`)

      const beforeSize = await calculateDirSize(build)
      const formattedBeforeSize = formatSize(beforeSize)
      console.log(`${colors.yellow}Initial size:${colors.reset} ${formattedBeforeSize}`)

      let filesRemoved = 0
      let dirsRemoved = 0
      let startTime = Date.now()

      // Process common removables first
      const commonResult = await processRemovables(build, commonRemovables)
      filesRemoved += commonResult.filesRemoved
      dirsRemoved += commonResult.dirsRemoved

      // Process macOS specific removables
      if (!MINIMAL_MODE) {
        const macResult = await processRemovables(build, macOSRemovables)
        filesRemoved += macResult.filesRemoved
        dirsRemoved += macResult.dirsRemoved
      } else {
        console.log(`${colors.yellow}Minimal mode enabled. Skipping non-essential removals.${colors.reset}`)
      }

      // Apply additional universal binary optimizations if this is a universal build
      if (build.includes('-universal')) {
        const universalResult = await optimizeUniversalBinary(build)
        filesRemoved += universalResult.filesRemoved
        dirsRemoved += universalResult.dirsRemoved
      }

      const afterSize = await calculateDirSize(build)
      const formattedAfterSize = formatSize(afterSize)
      const savedSpace = formatSize(beforeSize - afterSize)
      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2)

      printRemovalSummary(filesRemoved, dirsRemoved, savedSpace)
      console.log(`${colors.green}New size:${colors.reset} ${formattedAfterSize}`)
      console.log(
        `${colors.green}Reduction:${colors.reset} ${(((beforeSize - afterSize) / beforeSize) * 100).toFixed(2)}%`,
      )
      console.log(`${colors.gray}Time taken:${colors.reset} ${timeTaken}s`)

      totalFilesRemoved += filesRemoved
      totalDirsRemoved += dirsRemoved
      totalSizeBefore += beforeSize
      totalSizeAfter += afterSize
    }

    // Continue with Windows builds
    console.log(`\n${colors.cyan}Processing Windows builds...${colors.reset}`)
    const windowsBuilds = await glob(`${buildsDir}/*win32*`)

    if (windowsBuilds.length === 0) {
      console.log(`${colors.yellow}No Windows builds found${colors.reset}`)
    }

    for (const build of windowsBuilds) {
      console.log(`\n${colors.green}Processing Windows build: ${colors.yellow}${path.basename(build)}${colors.reset}`)

      const beforeSize = await calculateDirSize(build)
      const formattedBeforeSize = formatSize(beforeSize)
      console.log(`${colors.yellow}Initial size:${colors.reset} ${formattedBeforeSize}`)

      let filesRemoved = 0
      let dirsRemoved = 0
      let startTime = Date.now()

      // Process common removables
      const commonResult = await processRemovables(build, commonRemovables)
      filesRemoved += commonResult.filesRemoved
      dirsRemoved += commonResult.dirsRemoved

      // Process Windows specific removables
      const windowsResult = await processRemovables(build, windowsRemovables)
      filesRemoved += windowsResult.filesRemoved
      dirsRemoved += windowsResult.dirsRemoved

      const afterSize = await calculateDirSize(build)
      const formattedAfterSize = formatSize(afterSize)
      const savedSpace = formatSize(beforeSize - afterSize)
      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2)

      printRemovalSummary(filesRemoved, dirsRemoved, savedSpace)
      console.log(`${colors.green}New size:${colors.reset} ${formattedAfterSize}`)
      console.log(
        `${colors.green}Reduction:${colors.reset} ${(((beforeSize - afterSize) / beforeSize) * 100).toFixed(2)}%`,
      )
      console.log(`${colors.gray}Time taken:${colors.reset} ${timeTaken}s`)

      totalFilesRemoved += filesRemoved
      totalDirsRemoved += dirsRemoved
      totalSizeBefore += beforeSize
      totalSizeAfter += afterSize
    }
  } catch (err) {
    console.error(`${colors.bgRed}${colors.bright} ❌ Error in thinning process: ${colors.reset}`, err)
    process.exit(1)
  }

  // Return the stats for the final message
  return {
    totalSizeBefore,
    totalSizeAfter,
    totalFilesRemoved,
    totalDirsRemoved,
  }
}

// Print overall summary at the end
function printOverallSummary(stats) {
  console.log(`\n${colors.bgGreen}${colors.bright} ✅ Build thinning completed ${colors.reset}`)
  console.log(`${colors.green}App:${colors.reset} ${appName} v${appVersion}`)

  if (stats) {
    if (stats.totalFilesRemoved > 0 || stats.totalDirsRemoved > 0) {
      console.log(`${colors.yellow}Total files removed:${colors.reset} ${stats.totalFilesRemoved}`)
      console.log(`${colors.yellow}Total directories removed:${colors.reset} ${stats.totalDirsRemoved}`)

      const totalSaved = stats.totalSizeBefore - stats.totalSizeAfter
      const percentSaved = ((totalSaved / stats.totalSizeBefore) * 100).toFixed(2)

      console.log(`${colors.green}Total space saved:${colors.reset} ${formatSize(totalSaved)} (${percentSaved}%)`)
      console.log(`${colors.green}Original size:${colors.reset} ${formatSize(stats.totalSizeBefore)}`)
      console.log(`${colors.green}Final size:${colors.reset} ${formatSize(stats.totalSizeAfter)}`)
    }
  }

  if (MINIMAL_MODE) {
    console.log(`${colors.yellow}Mode:${colors.reset} Minimal (safe removals only)`)
  } else {
    console.log(`${colors.green}Mode:${colors.reset} Standard (all optimizations applied)`)
  }

  if (VERBOSE) {
    console.log(`${colors.gray}Verbose output mode was enabled${colors.reset}`)
  }

  console.log(`\n${colors.cyan}Run your builds now to verify they work correctly.${colors.reset}`)
  console.log(
    `${colors.cyan}If you encounter any issues, try running with ${colors.yellow}--minimal${colors.reset}${colors.cyan} flag.${colors.reset}`,
  )
}

// Run the script
thinBuilds()
  .then((stats) => {
    printOverallSummary(stats)
  })
  .catch((err) => {
    console.error(`${colors.bgRed}${colors.bright} ❌ Error: ${colors.reset}`, err)
    process.exit(1)
  })
