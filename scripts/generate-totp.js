/**
 * Simple script to generate a TOTP code from a secret
 *
 * This can help verify if the TOTP secret is in the correct format by comparing
 * the generated code with what your authenticator app shows.
 *
 * Usage:
 *   node generate-totp.js
 */

// Try to load environment variables from .env file
try {
  require('dotenv').config({ quiet: true })
  console.log('Loaded environment variables from .env file')
} catch (error) {
  console.warn('Failed to load .env file, using environment variables as is')
}

// Get the TOTP secret from the environment
let totpSecret = process.env.SSL_COM_TOTP_SECRET

// Extract the secret if it's in a URI format
if (totpSecret && totpSecret.includes('secret=')) {
  const secretMatch = totpSecret.match(/secret=([^&]+)/)
  if (secretMatch && secretMatch[1]) {
    totpSecret = secretMatch[1]
    console.log('Extracted TOTP secret from URI format')
  }
}

if (!totpSecret) {
  console.error('Error: SSL_COM_TOTP_SECRET environment variable not found')
  process.exit(1)
}

// Try different TOTP libraries to see if any of them work
try {
  // Try using node-2fa
  const twoFactor = require('node-2fa')
  const result = twoFactor.generateToken(totpSecret)

  console.log('Using node-2fa:')
  console.log('Generated token:', result ? result.token : 'Failed to generate token')
  console.log('Remaining time (seconds):', result ? result.remainingSeconds : 'N/A')
  console.log()
} catch (error) {
  console.warn('Failed to use node-2fa:', error.message)
  console.log('Please install it with: pnpm add node-2fa')
  console.log()
}

try {
  // Try using otplib v13+
  const { generateSync } = require('otplib')

  console.log('Using otplib:')

  try {
    const token = generateSync({ secret: totpSecret })
    console.log('Generated token:', token)
  } catch (error) {
    console.warn('Failed to generate token:', error.message)
  }

  console.log()
} catch (error) {
  console.warn('Failed to use otplib:', error.message)
  console.log('Please install it with: pnpm add otplib')
  console.log()
}

// Print instructions
console.log('Check if any of the generated tokens match what your authenticator app shows.')
console.log('If they match, the TOTP secret is correct but there may be an issue with the SSL.com CodeSignTool.')
console.log('If they do not match, there may be an issue with the TOTP secret format.')
