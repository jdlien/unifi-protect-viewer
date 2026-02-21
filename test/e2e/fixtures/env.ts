/**
 * Environment variable loading and validation for E2E tests.
 * Reads PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD from .env file.
 */

import * as path from 'node:path'

interface TestEnv {
  url: string
  username: string
  password: string
}

let cached: TestEnv | null | undefined

/**
 * Load test environment variables. Returns null if any required var is missing.
 * Results are cached after first call.
 */
export function getTestEnv(): TestEnv | null {
  if (cached !== undefined) return cached

  // Load .env from project root
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })
  } catch {
    // dotenv may not be installed; env vars might still be set externally
  }

  const url = process.env.PROTECT_URL
  const username = process.env.PROTECT_USERNAME
  const password = process.env.PROTECT_PASSWORD

  if (!url || !username || !password) {
    cached = null
    return null
  }

  cached = { url, username, password }
  return cached
}

/**
 * Load test environment variables, throwing if any are missing.
 */
export function requireTestEnv(): TestEnv {
  const env = getTestEnv()
  if (!env) {
    throw new Error(
      'Missing required environment variables: PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD.\n' +
        'Set them in .env or export them before running live E2E tests.',
    )
  }
  return env
}
