#!/usr/bin/env node

/**
 * This script loads environment variables from .env
 * and passes them explicitly to the build process
 */
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
require('dotenv').config()

// Load environment variables from .env file
console.log('Loading environment variables for notarization:')
const envPath = path.join(process.cwd(), '.env')

if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found!')
  process.exit(1)
}

// Log environment vars (redacted)
const appleId = process.env.APPLE_ID
const applePassword = process.env.APPLE_ID_PASSWORD ? '********' : 'not set'
const teamId = process.env.APPLE_TEAM_ID

console.log(`- NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`- APPLE_ID: ${appleId}`)
console.log(`- APPLE_ID_PASSWORD: ${applePassword}`)
console.log(`- APPLE_TEAM_ID: ${teamId}`)

// Get command line arguments and skip the first two (node and this file)
const args = process.argv.slice(2)
console.log(`Running command: ${args.join(' ')}`)

// Create environment variables object for the child process
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APPLE_ID: appleId,
  APPLE_ID_PASSWORD: process.env.APPLE_ID_PASSWORD,
  APPLE_TEAM_ID: teamId,
}

// Spawn the process with explicit environment variables
const child = spawn(args[0], args.slice(1), {
  env,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  process.exit(code)
})
