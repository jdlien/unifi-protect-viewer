const { ipcRenderer } = require('electron')
const utils = require('./utils')
const {
  LOGIN_ATTEMPTS_RESET_MS,
  LOGIN_SUCCESS_CHECK_INTERVAL_MS,
  LOGIN_SUCCESS_MAX_WAIT_MS,
  POST_LOGIN_DASHBOARD_DELAY_MS,
  POST_LOGIN_DASHBOARD_RETRY_DELAY_MS,
} = require('./constants')

// Constants
const MAX_LOGIN_ATTEMPTS = 3
const LOGIN_ATTEMPTS_KEY = 'loginAttempts'
const ATTEMPTS_RESET_TIME_KEY = 'loginAttemptsResetTime'

/**
 * Check if this is a login page
 * @returns {boolean} True if it's a login page
 */
function isLoginPage() {
  // Check URL patterns
  const url = window.location.href.toLowerCase()
  if (url.includes('login') || url.includes('signin') || url.includes('auth') || url.includes('/ui/login')) {
    return true
  }

  // Check for login form elements
  const usernameField =
    document.querySelector('input[name="username"]') || document.querySelector('input[type="email"]')
  const passwordField = document.querySelector('input[type="password"]')
  const loginButton =
    document.querySelector('button[type="submit"]') ||
    Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent.toLowerCase().includes('login'))

  return !!(usernameField && passwordField && loginButton)
}

/**
 * Get current login attempts from store
 * @returns {Promise<{attempts: number, resetTime: number}>} Current attempts and reset timestamp
 */
async function getLoginAttempts() {
  const config = await ipcRenderer.invoke('configLoad')
  const attempts = config?.[LOGIN_ATTEMPTS_KEY] || 0
  const resetTime = config?.[ATTEMPTS_RESET_TIME_KEY] || 0

  // Check if the reset time has passed
  const now = Date.now()
  if (resetTime > 0 && now > resetTime) {
    // Reset attempts if timeout has passed
    await updateLoginAttempts(0, 0)
    return { attempts: 0, resetTime: 0 }
  }

  return { attempts, resetTime }
}

/**
 * Update login attempts in the store
 * @param {number} attempts - Number of attempts
 * @param {number} resetTime - Timestamp when attempts should reset
 */
async function updateLoginAttempts(attempts, resetTime) {
  const updates = {
    [LOGIN_ATTEMPTS_KEY]: attempts,
    [ATTEMPTS_RESET_TIME_KEY]: resetTime,
  }
  await ipcRenderer.invoke('configSavePartial', updates)
}

/**
 * Login handler - attempt to fill in credentials and submit
 * @returns {Promise<boolean>} True if login attempted successfully
 */
async function attemptLogin() {
  try {
    // Get current login attempts from persistent storage
    const { attempts } = await getLoginAttempts()
    const currentAttempts = attempts + 1

    utils.log(`Login attempt ${currentAttempts}/${MAX_LOGIN_ATTEMPTS}`)

    // Check max attempts
    if (currentAttempts > MAX_LOGIN_ATTEMPTS) {
      utils.logError('Maximum login attempts reached, stopping auto-login')
      return false
    }

    // Set reset time if this is the first attempt
    const resetTime =
      currentAttempts === 1 ? Date.now() + LOGIN_ATTEMPTS_RESET_MS : Date.now() + LOGIN_ATTEMPTS_RESET_MS

    // Update attempt counter in persistent storage
    await updateLoginAttempts(currentAttempts, resetTime)

    // Load credentials
    const config = await ipcRenderer.invoke('configLoad')
    if (!config?.username || !config?.password) {
      utils.log('No credentials found in config')
      return false
    }

    // Find form elements
    utils.log('Searching for login form elements')
    const usernameField =
      document.querySelector('input[name="username"]') ||
      document.querySelector('input[type="email"]') ||
      document.querySelector('input[type="text"][id*="user"]')

    const passwordField = document.querySelector('input[type="password"]')

    const submitButton =
      document.querySelector('button[type="submit"]') ||
      Array.from(document.querySelectorAll('button')).find(
        (btn) => btn.textContent.toLowerCase().includes('login') || btn.textContent.toLowerCase().includes('sign in'),
      )

    if (!usernameField || !passwordField || !submitButton) {
      utils.logWarn('Could not find all login form elements:', {
        username: !!usernameField,
        password: !!passwordField,
        button: !!submitButton,
      })
      return false
    }

    // Fill in credentials
    usernameField.value = config.username
    usernameField.dispatchEvent(new Event('input', { bubbles: true }))
    usernameField.dispatchEvent(new Event('change', { bubbles: true }))

    passwordField.value = config.password
    passwordField.dispatchEvent(new Event('input', { bubbles: true }))
    passwordField.dispatchEvent(new Event('change', { bubbles: true }))

    // Check the "rememberMe" checkbox if it exists
    const rememberMeCheckbox =
      document.querySelector('input[id="rememberMe"]') ||
      document.querySelector('input[name="rememberMe"]') ||
      document.querySelector('input[data-id="rememberMe"]') ||
      document.querySelector('input[role="checkbox"][id*="remember"]')

    if (rememberMeCheckbox && !rememberMeCheckbox.checked) {
      rememberMeCheckbox.checked = true
      rememberMeCheckbox.dispatchEvent(new Event('input', { bubbles: true }))
      rememberMeCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
      rememberMeCheckbox.dispatchEvent(new Event('click', { bubbles: true }))
    }

    // Submit form and set up a login success monitor
    submitButton.click()

    // Set up a special monitor for login success that doesn't rely on URL monitoring
    setupLoginSuccessMonitor()

    return true
  } catch (error) {
    utils.logError('Auto-login failed:', error)
    return false
  }
}

/**
 * Set up a monitor to detect successful login completion and apply dashboard customizations
 */
function setupLoginSuccessMonitor() {
  // Check for dashboard elements periodically
  const startTime = Date.now()
  const dashboard = require('./dashboard.js')
  const ui = require('./ui.js')
  const MAX_CHECK_TIME = LOGIN_SUCCESS_MAX_WAIT_MS
  const CHECK_INTERVAL = LOGIN_SUCCESS_CHECK_INTERVAL_MS

  // Flag to track if we've already detected login success
  let loginSuccessDetected = false

  const checkInterval = setInterval(() => {
    // Stop checking if we've exceeded the maximum time
    if (Date.now() - startTime > MAX_CHECK_TIME) {
      clearInterval(checkInterval)
      return
    }

    // Check if the URL includes dashboard, which indicates successful login
    if (window.location.href.includes('/protect/dashboard') && !loginSuccessDetected) {
      loginSuccessDetected = true

      // Reset login attempts counter
      resetLoginAttempts().catch((err) => {
        utils.logError('Failed to reset login attempts counter:', err)
      })

      // Wait for dashboard to fully load then apply customizations
      setTimeout(async () => {
        // First check if dashboard page is ready
        try {
          const isReady = await dashboard.waitForDashboardReady()

          if (isReady) {
            ui.handleLiveView()
          } else {
            // Try one more time after a longer delay
            setTimeout(async () => {
              const isReadyRetry = await dashboard.waitForDashboardReady()

              if (isReadyRetry) {
                ui.handleLiveView()
              }
            }, POST_LOGIN_DASHBOARD_RETRY_DELAY_MS)
          }
        } catch (error) {
          utils.logError('Error during post-login dashboard customization:', error)
        }
      }, POST_LOGIN_DASHBOARD_DELAY_MS)

      clearInterval(checkInterval)
    }
  }, CHECK_INTERVAL)
}

/**
 * Reset login attempts counter
 * Call after successful login
 */
async function resetLoginAttempts() {
  await updateLoginAttempts(0, 0)
}

/**
 * Initialize the login page by finding and auto-filling login form
 * @returns {boolean} True if login form was found and filled
 */
function initializeLoginPage() {
  const loginElements = document.querySelector('form input[type="password"]')
  if (loginElements) {
    attemptLogin()
    return true
  }
  return false
}

module.exports = {
  isLoginPage,
  attemptLogin,
  resetLoginAttempts,
  initializeLoginPage,
}
