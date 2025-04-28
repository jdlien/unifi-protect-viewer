/**
 * Ultra simple direct script for code signing - just calls the shell script
 *
 * Usage:
 *   node ultra-direct.js <path-to-exe-file>
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// Get file to sign from command line
const filePath = process.argv[2]

if (!filePath) {
  console.error('Error: No file specified')
  console.error('Usage: node ultra-direct.js <path-to-exe-file>')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`)
  process.exit(1)
}

// Get the path to the shell script
const scriptPath = path.join(__dirname, 'super-simple-sign.sh')

console.log(`Executing shell script: ${scriptPath}`)
console.log(`Signing file: ${filePath}`)

try {
  // Execute the shell script directly, passing the file path
  execSync(`${scriptPath} "${filePath}"`, { stdio: 'inherit' })
  console.log('Signing process completed')
  process.exit(0)
} catch (error) {
  console.error('Error during signing:', error.message)
  process.exit(1)
}
