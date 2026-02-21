// Performs all steps to release a new version of the app
const { execSync } = require('child_process')
const fs = require('fs')
const semver = require('semver')
require('dotenv').config({ quiet: true })

// Check for required environment variables
const requiredVars = ['GH_TOKEN']
const macVars = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
const sslComVars = ['SSL_COM_USERNAME', 'SSL_COM_PASSWORD', 'SSL_COM_CREDENTIAL_ID', 'SSL_COM_TOTP_SECRET']

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

// Check for SSL.com signing variables
const missingSslVars = sslComVars.filter((varName) => !process.env[varName])
if (missingSslVars.length > 0) {
  console.error(`Warning: Missing SSL.com code signing variables: ${missingSslVars.join(', ')}`)
  console.error('Windows code signing may fail. Continue? (y/n)')
  const response = require('readline-sync').question('')
  if (response.toLowerCase() !== 'y') {
    process.exit(1)
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

// Compile TypeScript before any packaging commands to avoid stale/missing out/
console.log('Compiling TypeScript...')
try {
  execSync('pnpm build:ts', { stdio: 'inherit' })
} catch (error) {
  console.error('Error compiling TypeScript:', error.message)
  process.exit(1)
}

// Function to create build configurations
function createBuildConfigs() {
  const macBaseConfig = `NODE_ENV=production APPLE_ID=${process.env.APPLE_ID} APPLE_APP_SPECIFIC_PASSWORD=${process.env.APPLE_APP_SPECIFIC_PASSWORD} APPLE_TEAM_ID=${process.env.APPLE_TEAM_ID} CSC_DISABLE_TIMESTAMP=true`

  return [
    // macOS builds - Build all architectures together to ensure consistent update files
    {
      name: 'macOS (all architectures)',
      command: `${macBaseConfig} electron-builder --mac --universal --publish always`,
    },

    // Windows builds - consolidated into a single build
    {
      name: 'Windows (all architectures)',
      command: 'electron-builder --win --publish always',
      condition: () =>
        process.env.SSL_COM_USERNAME &&
        process.env.SSL_COM_PASSWORD &&
        process.env.SSL_COM_CREDENTIAL_ID &&
        process.env.SSL_COM_TOTP_SECRET,
      fallback:
        'Windows builds skipped: SSL.com code signing credentials not found. Set SSL_COM_USERNAME, SSL_COM_PASSWORD, SSL_COM_CREDENTIAL_ID, and SSL_COM_TOTP_SECRET environment variables.',
    },

    // Linux builds - consolidated into a single build
    {
      name: 'Linux (all architectures)',
      command: 'electron-builder --linux --publish always',
    },
  ]
}

const builds = createBuildConfigs()

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
