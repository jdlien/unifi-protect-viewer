// Performs all steps to release a new version of the app
const { execSync } = require('child_process')
const fs = require('fs')
const semver = require('semver')
require('dotenv').config()

// Check for required environment variables
const requiredVars = ['GH_TOKEN']
const macVars = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']

const missingVars = requiredVars.filter((varName) => !process.env[varName])
if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`)
  process.exit(1)
}

// Check for macOS-specific variables if on macOS
if (process.platform === 'darwin') {
  const missingMacVars = macVars.filter((varName) => !process.env[varName])
  if (missingMacVars.length > 0) {
    console.error(`Warning: Missing macOS notarization variables: ${missingMacVars.join(', ')}`)
    console.error('Notarization may fail. Continue? (y/n)')
    const response = require('readline-sync').question('')
    if (response.toLowerCase() !== 'y') {
      process.exit(1)
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const versionBump = args[0] || 'patch' // Default to patch version bump
const validBumps = ['major', 'minor', 'patch', 'none']
if (!validBumps.includes(versionBump)) {
  console.error(`Invalid version bump type: ${versionBump}. Must be one of: ${validBumps.join(', ')}`)
  process.exit(1)
}

// Read package.json
let packageJson
try {
  packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
} catch (error) {
  console.error('Error reading package.json:', error.message)
  process.exit(1)
}

// Bump version if requested
let newVersion = packageJson.version
if (versionBump !== 'none') {
  newVersion = semver.inc(packageJson.version, versionBump)
  console.log(`Bumping version from ${packageJson.version} to ${newVersion}`)

  // Update package.json with new version
  packageJson.version = newVersion
  fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2) + '\n')

  // Commit version change
  try {
    execSync('git add package.json', { stdio: 'inherit' })
    execSync(`git commit -m "Bump version to ${newVersion}"`, { stdio: 'inherit' })
    console.log('✅ Version change committed')
  } catch (error) {
    console.error('Error committing version change:', error.message)
    process.exit(1)
  }

  // Create and push tag
  try {
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' })
    execSync('git push', { stdio: 'inherit' })
    execSync('git push --tags', { stdio: 'inherit' })
    console.log(`✅ Created and pushed tag v${newVersion}`)
  } catch (error) {
    console.error('Error creating or pushing tag:', error.message)
    process.exit(1)
  }
}

// Clean previous builds
console.log('Cleaning previous builds...')
try {
  execSync('rm -rf dist/ releases/', { stdio: 'inherit' })
} catch (error) {
  console.warn('Warning: Could not clean previous builds:', error.message)
}

// Build for all platforms
console.log('\n=== Starting super build for all platforms ===\n')

// Set build environment
process.env.NODE_ENV = 'production'

const builds = [
  // macOS builds
  {
    name: 'macOS Universal (arm64+x64)',
    command: `NODE_ENV=production APPLE_TEAM_ID=${process.env.APPLE_TEAM_ID} electron-builder --mac --universal --publish always`,
  },
  {
    name: 'macOS arm64 (Apple Silicon)',
    command: `NODE_ENV=production APPLE_TEAM_ID=${process.env.APPLE_TEAM_ID} electron-builder --mac --arm64 --publish always`,
  },
  {
    name: 'macOS x64 (Intel)',
    command: `NODE_ENV=production APPLE_TEAM_ID=${process.env.APPLE_TEAM_ID} electron-builder --mac --x64 --publish always`,
  },

  // Windows builds
  {
    name: 'Windows arm64',
    command: 'electron-builder --win --arm64 --publish always',
    condition: () => process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD,
    fallback:
      'Windows builds skipped: code signing credentials not found. Set WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD environment variable.',
  },
  {
    name: 'Windows x64 (64-bit)',
    command: 'electron-builder --win --x64 --publish always',
    condition: () => process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD,
    fallback:
      'Windows builds skipped: code signing credentials not found. Set WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD environment variable.',
  },

  // Linux builds
  {
    name: 'Linux x64',
    command: 'electron-builder --linux --x64 --publish always',
  },
  {
    name: 'Linux arm64',
    command: 'electron-builder --linux --arm64 --publish always',
  },
]

// Execute each build
const results = []
for (const build of builds) {
  console.log(`\n📦 Building for ${build.name}...`)
  try {
    if (build.condition && !build.condition()) {
      console.log(build.fallback)
      results.push({ name: build.name, success: false, error: build.fallback })
      continue
    }
    execSync(build.command, { stdio: 'inherit' })
    console.log(`✅ ${build.name} build successful`)
    results.push({ name: build.name, success: true })
  } catch (error) {
    console.error(`❌ ${build.name} build failed:`, error.message)
    results.push({ name: build.name, success: false, error: error.message })
  }
}

// Print summary
console.log('\n=== Build Summary ===')
const successful = results.filter((r) => r.success).length
const failed = results.filter((r) => !r.success).length

console.log(`${successful} builds succeeded, ${failed} builds failed\n`)
console.log('Detailed results:')
results.forEach((result) => {
  const icon = result.success ? '✅' : '❌'
  console.log(`${icon} ${result.name}`)
  if (!result.success) {
    console.log(`   Error: ${result.error}`)
  }
})

if (failed > 0) {
  console.log('\n⚠️ Some builds failed. Check the logs above for details.')
  process.exit(1)
} else {
  console.log('\n🎉 All builds completed successfully!')
  console.log(`Version ${newVersion} has been released to GitHub.`)
}
