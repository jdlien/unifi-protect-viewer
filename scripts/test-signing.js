/**
 * Test script for Windows code signing using SSL.com's CodeSignTool
 *
 * This script can be used to test the code signing process without having to build the entire app.
 *
 * Usage:
 *   node test-signing.js <path-to-exe-file>
 *
 * Make sure to set the following environment variables before running:
 *   - SSL_COM_USERNAME
 *   - SSL_COM_PASSWORD
 *   - SSL_COM_CREDENTIAL_ID
 *   - SSL_COM_TOTP_SECRET
 *   - CODE_SIGN_TOOL_PATH (optional, defaults to ~/bin/CodeSignTool)
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Load environment variables from .env file if it exists
try {
  // Use dotenv with option to process environment variables
  // This helps with special characters in passwords
  require('dotenv').config({ processEnv: process.env })
  console.log('Loaded environment variables from .env file')
} catch (error) {
  console.warn(
    'dotenv module not found, skipping .env loading. This is not an error if the environment variables are already set.',
  )
}

// Check if we have a test file to sign
const testFile = process.argv[2]
if (!testFile) {
  console.error('Error: No test file specified')
  console.error('Usage: node test-signing.js <path-to-exe-file>')
  process.exit(1)
}

// Check if the file exists
if (!fs.existsSync(testFile)) {
  console.error(`Error: Test file does not exist: ${testFile}`)
  process.exit(1)
}

// Check if the file is an EXE
if (!testFile.toLowerCase().endsWith('.exe')) {
  console.error('Error: Only .exe files can be signed with this tool')
  process.exit(1)
}

// Get credentials from environment variables
const username = process.env.SSL_COM_USERNAME
const password = process.env.SSL_COM_PASSWORD
const credentialId = process.env.SSL_COM_CREDENTIAL_ID
let totpSecret = process.env.SSL_COM_TOTP_SECRET

// Extract the secret from a TOTP URI if it's in that format
if (totpSecret && totpSecret.includes('secret=')) {
  const secretMatch = totpSecret.match(/secret=([^&]+)/)
  if (secretMatch && secretMatch[1]) {
    totpSecret = secretMatch[1]
    console.log('Extracted TOTP secret from URI format')
  }
}

// Add debug info about TOTP secret (partially masked)
const firstFew = totpSecret.substring(0, 4)
const lastFew = totpSecret.substring(totpSecret.length - 4)
console.log(`DEBUG - TOTP Secret format: ${firstFew}...${lastFew} (length: ${totpSecret.length})`)

// Check if we have all the required environment variables
if (!username || !password || !credentialId || !totpSecret) {
  const missing = []
  if (!username) missing.push('SSL_COM_USERNAME')
  if (!password) missing.push('SSL_COM_PASSWORD')
  if (!credentialId) missing.push('SSL_COM_CREDENTIAL_ID')
  if (!totpSecret) missing.push('SSL_COM_TOTP_SECRET')

  console.error(`Error: Missing required environment variables: ${missing.join(', ')}`)
  console.error('Make sure these variables are defined in your .env file or environment')
  process.exit(1)
}

// Get the CodeSignTool path
const codeSignToolPath = process.env.CODE_SIGN_TOOL_PATH || path.join(os.homedir(), 'bin', 'CodeSignTool')

// Log the presence of the CodeSignTool path
if (fs.existsSync(codeSignToolPath)) {
  console.log(`Using CodeSignTool at: ${codeSignToolPath}`)
} else {
  console.error(`Error: CodeSignTool not found at ${codeSignToolPath}`)
  console.error('The signing process will fail unless the tool is installed before signing starts')
  process.exit(1)
}

// Get original file path
const originalFilePath = path.resolve(testFile)
console.log(`Test signing ${originalFilePath}...`)

// Create a temporary directory for files
const tempDir = path.join(os.tmpdir(), 'codesigntool')
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
  console.log(`Created temporary directory: ${tempDir}`)
}

// Create a copy of the file with a simple name to avoid spaces
const tempFileName = `temp_${Date.now()}.exe`
const tempFilePath = path.join(tempDir, tempFileName)

try {
  // Copy the file to a temporary location with a simple name
  fs.copyFileSync(originalFilePath, tempFilePath)
  console.log(`Created temporary copy at: ${tempFilePath}`)

  // Create temporary script file
  const scriptPath = path.join(tempDir, os.platform() === 'win32' ? 'test-sign.bat' : 'test-sign.sh')

  // Build the command with all available parameters
  let commandParams = []
  commandParams.push(`-username='${username}'`)
  commandParams.push(`-password='${password.replace(/'/g, "'\\''")}'`) // Escape single quotes for bash
  commandParams.push(`-credential_id='${credentialId}'`)
  commandParams.push(`-totp_secret=${totpSecret}`)
  commandParams.push(`-input_file_path="${tempFilePath}"`)
  commandParams.push(`-output_dir_path="${tempDir}"`)
  commandParams.push(`-override`)

  // Create a script with the correct command, handling special characters appropriately
  let scriptContent

  if (os.platform() === 'win32') {
    // Windows batch script - escape special characters in credentials
    // For Windows, we need ^ before special characters
    const escapedPassword = password.replace(/[&^|<>()]/g, '^$&')

    scriptContent = `@echo off
set CODE_SIGN_TOOL_PATH=${codeSignToolPath}
"${path.join(codeSignToolPath, 'CodeSignTool.bat')}" sign ^
  -username="${username}" ^
  -password="${escapedPassword}" ^
  -credential_id="${credentialId}" ^
  -totp_secret=${totpSecret} ^
  -input_file_path="${tempFilePath}" ^
  -output_dir_path="${tempDir}" ^
  -override
`
  } else {
    // Unix shell script - use single quotes for values with special characters
    scriptContent = `#!/bin/bash
export CODE_SIGN_TOOL_PATH="${codeSignToolPath}"
"${path.join(codeSignToolPath, 'CodeSignTool.sh')}" sign \\
  ${commandParams.join(' \\\n  ')}
`
  }

  // Write script with restricted permissions
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o700 }) // rwx for user only
  console.log('Created temporary signing script')

  // Print debug info about the command (with password and TOTP masked)
  console.log('DEBUG - Command being executed (password and TOTP secret redacted):')
  console.log(
    scriptContent
      .replace(/-password=(['"]).*?\1/g, '-password=******')
      .replace(/-totp_secret=(['"]).*?\1/g, '-totp_secret=******'),
  )

  // Execute the script
  console.log('Executing SSL.com CodeSignTool...')
  execSync(scriptPath, { stdio: 'inherit' })

  // Check if the signed file exists in the temp directory
  if (!fs.existsSync(tempFilePath)) {
    console.error('Error: Signed file not found after signing process')
    process.exit(1)
  }

  // If successful, copy the signed file back to the original location
  fs.copyFileSync(tempFilePath, originalFilePath)
  console.log(`Copied signed file back to original location: ${originalFilePath}`)

  console.log('Test signing completed successfully')
} catch (error) {
  console.error('Error during test signing:', error.message)
  if (error.stdout) console.log('stdout:', error.stdout.toString())
  if (error.stderr) console.error('stderr:', error.stderr.toString())
  console.error('Stack trace:', error.stack)
  process.exit(1)
} finally {
  // Clean up temporary files
  try {
    const scriptPath = path.join(tempDir, os.platform() === 'win32' ? 'test-sign.bat' : 'test-sign.sh')
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath)
    }
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath)
    }
    console.log('Cleaned up temporary files')
  } catch (cleanupError) {
    console.warn('Warning: Failed to clean up temporary files:', cleanupError.message)
  }
}
