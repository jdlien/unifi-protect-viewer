const { ipcRenderer } = require('electron')

// Constants
const MAX_LOGIN_ATTEMPTS = 3
const LOGIN_ATTEMPTS_KEY = 'loginAttempts'
const ATTEMPTS_RESET_TIME_KEY = 'loginAttemptsResetTime'
const RESET_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

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

    console.log(`Login attempt ${currentAttempts}/${MAX_LOGIN_ATTEMPTS}`)

    // Check max attempts
    if (currentAttempts > MAX_LOGIN_ATTEMPTS) {
      console.error('Maximum login attempts reached, stopping auto-login')
      return false
    }

    // Set reset time if this is the first attempt
    const resetTime = currentAttempts === 1 ? Date.now() + RESET_TIMEOUT_MS : Date.now() + RESET_TIMEOUT_MS

    // Update attempt counter in persistent storage
    await updateLoginAttempts(currentAttempts, resetTime)

    // Load credentials
    const config = await ipcRenderer.invoke('configLoad')
    if (!config?.username || !config?.password) {
      console.log('No credentials found in config')
      return false
    }

    // Find form elements
    console.log('Searching for login form elements')
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
      console.warn('Could not find all login form elements:', {
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

    // Submit form
    submitButton.click()

    return true
  } catch (error) {
    console.error('Auto-login failed:', error)
    return false
  }
} // end attemptLogin

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
