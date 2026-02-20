// Simple script to build macOS app with verbose output
const { execSync } = require('child_process')
require('dotenv').config({ quiet: true })

// Check for required environment variables
const requiredVars = ['GH_TOKEN', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
const missingVars = requiredVars.filter((varName) => !process.env[varName])

if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`)
  process.exit(1)
}

// Clean previous builds
console.log('Cleaning previous builds...')
try {
  execSync('rm -rf dist/', { stdio: 'inherit' })
} catch (error) {
  console.warn('Warning: Could not clean previous builds:', error.message)
}

// Set build environment
process.env.NODE_ENV = 'production'

// Create the command with specific timestamp option
const macBuildCommand = `NODE_ENV=production APPLE_ID=${process.env.APPLE_ID} APPLE_APP_SPECIFIC_PASSWORD=${process.env.APPLE_APP_SPECIFIC_PASSWORD} APPLE_TEAM_ID=${process.env.APPLE_TEAM_ID} DEBUG=electron-builder electron-builder --mac --x64 --publish never --debug`

console.log(`\n📦 Building for macOS...\n`)
console.log(`Running command: ${macBuildCommand}\n`)

try {
  execSync(macBuildCommand, { stdio: 'inherit' })
  console.log(`\n✅ macOS build successful`)
} catch (error) {
  console.error(`\n❌ macOS build failed: ${error.message}`)
  process.exit(1)
}
