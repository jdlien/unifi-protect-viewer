const { ipcRenderer } = require('electron')

// Track login attempts to prevent infinite loops
let loginAttempts = 0
const MAX_LOGIN_ATTEMPTS = 3

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
 * Login handler - attempt to fill in credentials and submit
 * @returns {Promise<boolean>} True if login attempted successfully
 */
async function attemptLogin() {
  console.log(`Login attempt ${loginAttempts + 1}/${MAX_LOGIN_ATTEMPTS}`)

  // Increment attempt counter and check max attempts
  loginAttempts++
  if (loginAttempts > MAX_LOGIN_ATTEMPTS) {
    console.error('Maximum login attempts reached, stopping auto-login')
    return false
  }

  try {
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

    // console.log('Found all login form elements, filling credentials')

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

module.exports = {
  isLoginPage,
  attemptLogin,
}
