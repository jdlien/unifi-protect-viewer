/**
 * Waiting for DOM elements to be ready
 * @param {Function} condition - Condition function that returns a boolean
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<void>} - Resolves when condition is met, rejects on timeout
 */
async function waitUntil(condition, timeout = 30000, interval = 20) {
  // Try the condition immediately first
  try {
    if (condition()) return
  } catch (error) {
    // Ignore initial errors, will retry
  }

  return new Promise((resolve, reject) => {
    let startTime = Date.now()

    const intervalId = setInterval(() => {
      // Check if we've timed out
      if (Date.now() - startTime > timeout) {
        clearInterval(intervalId)
        return reject(new Error('Timeout waiting for condition'))
      }

      // Check the condition safely
      try {
        if (condition()) {
          clearInterval(intervalId)
          resolve()
        }
      } catch (error) {
        // Don't fail on transient DOM errors, unless we time out
      }
    }, interval)
  })
}

/**
 * Utility function for logging that only logs in development mode
 * @param {...any} args - Arguments to log
 */
function log(...args) {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args)
    }
  } catch (err) {
    console.error('Error in log function:', err)
  }
}

/**
 * Utility function for error logging
 * Always logs errors but with different verbosity in production vs development
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
function logError(message, error) {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.error(message, error)
    } else {
      // In production, log a simplified version without the stack trace
      console.error(message, error?.message || error)
    }
  } catch (err) {
    // Last resort fallback if even error logging fails
    console.error('Error in logError function:', err)
    try {
      console.error('Original error message:', message)
    } catch (_) {
      // Silently fail if nothing works
    }
  }
}

/**
 * Wait for a specified amount of time
 * @param {number} amount - Time to wait in milliseconds
 * @returns {Promise<void>}
 */
async function wait(amount) {
  return new Promise((resolve) => setTimeout(resolve, amount))
}

/**
 * Set a style property on an element
 * @param {HTMLElement} element - The element to style
 * @param {string} style - The CSS property to set
 * @param {string} value - The value to set
 */
function setStyle(element, style, value) {
  if (!element) return
  element.style[style] = value
}

/**
 * Click an element
 * @param {HTMLElement} element - The element to click
 */
function clickElement(element) {
  if (!element) return

  if (element.click) {
    element.click()
  } else {
    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    })

    element.dispatchEvent(event)
  }
}

/**
 * Logger interface for electron-updater
 * Implements the expected methods: info, warn, error, debug
 */
const logger = {
  info(...args) {
    log('[INFO]', ...args)
  },
  warn(...args) {
    log('[WARN]', ...args)
  },
  error(...args) {
    logError('[ERROR]', args.length > 0 ? args[0] : 'Unknown error')
  },
  debug(...args) {
    if (process.env.NODE_ENV === 'development') {
      log('[DEBUG]', ...args)
    }
  },
}

module.exports = {
  waitUntil,
  wait,
  setStyle,
  clickElement,
  log,
  logError,
  logger,
}
