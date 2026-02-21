import { log, logError, logWarn } from './utils'
import {
  LOGIN_ATTEMPTS_RESET_MS,
  LOGIN_SUCCESS_CHECK_INTERVAL_MS,
  LOGIN_SUCCESS_MAX_WAIT_MS,
  POST_LOGIN_DASHBOARD_DELAY_MS,
  POST_LOGIN_DASHBOARD_RETRY_DELAY_MS,
} from './constants'

const { ipcRenderer } = require('electron') as typeof import('electron')

// Constants
const MAX_LOGIN_ATTEMPTS = 3
const LOGIN_ATTEMPTS_KEY = 'loginAttempts'
const ATTEMPTS_RESET_TIME_KEY = 'loginAttemptsResetTime'

/**
 * Check if this is a login page
 */
export function isLoginPage(): boolean {
  const url = window.location.href.toLowerCase()
  if (url.includes('login') || url.includes('signin') || url.includes('auth') || url.includes('/ui/login')) {
    return true
  }

  const usernameField =
    document.querySelector('input[name="username"]') || document.querySelector('input[type="email"]')
  const passwordField = document.querySelector('input[type="password"]')
  const loginButton =
    document.querySelector('button[type="submit"]') ||
    Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent?.toLowerCase().includes('login'))

  return !!(usernameField && passwordField && loginButton)
}

/**
 * Get current login attempts from store
 */
async function getLoginAttempts(): Promise<{ attempts: number; resetTime: number }> {
  const config = await ipcRenderer.invoke('configLoad')
  const attempts = ((config as Record<string, unknown>)?.[LOGIN_ATTEMPTS_KEY] as number) || 0
  const resetTime = ((config as Record<string, unknown>)?.[ATTEMPTS_RESET_TIME_KEY] as number) || 0

  const now = Date.now()
  if (resetTime > 0 && now > resetTime) {
    await updateLoginAttempts(0, 0)
    return { attempts: 0, resetTime: 0 }
  }

  return { attempts, resetTime }
}

/**
 * Update login attempts in the store
 */
async function updateLoginAttempts(attempts: number, resetTime: number): Promise<void> {
  const updates = {
    [LOGIN_ATTEMPTS_KEY]: attempts,
    [ATTEMPTS_RESET_TIME_KEY]: resetTime,
  }
  await ipcRenderer.invoke('configSavePartial', updates)
}

/**
 * Login handler - attempt to fill in credentials and submit
 */
export async function attemptLogin(): Promise<boolean> {
  try {
    const { attempts } = await getLoginAttempts()
    const currentAttempts = attempts + 1

    log(`Login attempt ${currentAttempts}/${MAX_LOGIN_ATTEMPTS}`)

    if (currentAttempts > MAX_LOGIN_ATTEMPTS) {
      logError('Maximum login attempts reached, stopping auto-login')
      return false
    }

    const resetTime = Date.now() + LOGIN_ATTEMPTS_RESET_MS

    await updateLoginAttempts(currentAttempts, resetTime)

    const config = (await ipcRenderer.invoke('configLoad')) as Record<string, string> | null
    if (!config?.username || !config?.password) {
      log('No credentials found in config')
      return false
    }

    log('Searching for login form elements')
    const usernameField = (document.querySelector('input[name="username"]') ||
      document.querySelector('input[type="email"]') ||
      document.querySelector('input[type="text"][id*="user"]')) as HTMLInputElement | null

    const passwordField = document.querySelector('input[type="password"]') as HTMLInputElement | null

    const submitButton = (document.querySelector('button[type="submit"]') ||
      Array.from(document.querySelectorAll('button')).find(
        (btn) => btn.textContent?.toLowerCase().includes('login') || btn.textContent?.toLowerCase().includes('sign in'),
      )) as HTMLButtonElement | null

    if (!usernameField || !passwordField || !submitButton) {
      logWarn('Could not find all login form elements:', {
        username: !!usernameField,
        password: !!passwordField,
        button: !!submitButton,
      })
      return false
    }

    usernameField.value = config.username
    usernameField.dispatchEvent(new Event('input', { bubbles: true }))
    usernameField.dispatchEvent(new Event('change', { bubbles: true }))

    passwordField.value = config.password
    passwordField.dispatchEvent(new Event('input', { bubbles: true }))
    passwordField.dispatchEvent(new Event('change', { bubbles: true }))

    const rememberMeCheckbox = (document.querySelector('input[id="rememberMe"]') ||
      document.querySelector('input[name="rememberMe"]') ||
      document.querySelector('input[data-id="rememberMe"]') ||
      document.querySelector('input[role="checkbox"][id*="remember"]')) as HTMLInputElement | null

    if (rememberMeCheckbox && !rememberMeCheckbox.checked) {
      rememberMeCheckbox.checked = true
      rememberMeCheckbox.dispatchEvent(new Event('input', { bubbles: true }))
      rememberMeCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
      rememberMeCheckbox.dispatchEvent(new Event('click', { bubbles: true }))
    }

    submitButton.click()
    setupLoginSuccessMonitor()

    return true
  } catch (error) {
    logError('Auto-login failed:', error)
    return false
  }
}

/**
 * Set up a monitor to detect successful login completion and apply dashboard customizations
 */
function setupLoginSuccessMonitor(): void {
  const startTime = Date.now()
  const dashboard = require('./dashboard') as typeof import('./dashboard')
  const ui = require('./ui') as typeof import('./ui')
  const MAX_CHECK_TIME = LOGIN_SUCCESS_MAX_WAIT_MS
  const CHECK_INTERVAL = LOGIN_SUCCESS_CHECK_INTERVAL_MS

  let loginSuccessDetected = false

  const checkInterval = setInterval(() => {
    if (Date.now() - startTime > MAX_CHECK_TIME) {
      clearInterval(checkInterval)
      return
    }

    if (window.location.href.includes('/protect/dashboard') && !loginSuccessDetected) {
      loginSuccessDetected = true

      resetLoginAttempts().catch((err: unknown) => {
        logError('Failed to reset login attempts counter:', err)
      })

      setTimeout(async () => {
        try {
          const isReady = await dashboard.waitForDashboardReady()

          if (isReady) {
            ui.handleLiveView()
          } else {
            setTimeout(async () => {
              const isReadyRetry = await dashboard.waitForDashboardReady()

              if (isReadyRetry) {
                ui.handleLiveView()
              }
            }, POST_LOGIN_DASHBOARD_RETRY_DELAY_MS)
          }
        } catch (error) {
          logError('Error during post-login dashboard customization:', error)
        }
      }, POST_LOGIN_DASHBOARD_DELAY_MS)

      clearInterval(checkInterval)
    }
  }, CHECK_INTERVAL)
}

/**
 * Reset login attempts counter.
 * Call after successful login.
 */
export async function resetLoginAttempts(): Promise<void> {
  await updateLoginAttempts(0, 0)
}

/**
 * Initialize the login page by finding and auto-filling login form
 */
export function initializeLoginPage(): boolean {
  const loginElements = document.querySelector('form input[type="password"]')
  if (loginElements) {
    attemptLogin()
    return true
  }
  return false
}
