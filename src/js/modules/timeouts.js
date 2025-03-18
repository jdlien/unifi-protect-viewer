/**
 * Module to handle timeouts consistently across pages
 */

// Store active timeouts by purpose
const activeTimeouts = {
  connection: null,
  // Add more timeout categories as needed
}

/**
 * Set a timeout and store its ID
 * @param {string} purpose - What the timeout is for (e.g., 'connection')
 * @param {Function} callback - Function to call when timeout triggers
 * @param {number} duration - Time in milliseconds
 * @returns {number} - The timeout ID
 */
function setTimeout(purpose, callback, duration) {
  // Clear any existing timeout for this purpose
  clearTimeout(purpose)

  // Set the new timeout
  const timeoutId = window.setTimeout(() => {
    // Remove reference when timeout executes
    activeTimeouts[purpose] = null
    callback()
  }, duration)

  // Store the timeout ID
  activeTimeouts[purpose] = timeoutId

  return timeoutId
}

/**
 * Clear a timeout by purpose
 * @param {string} purpose - The purpose identifier (e.g., 'connection')
 */
function clearTimeout(purpose) {
  if (activeTimeouts[purpose]) {
    window.clearTimeout(activeTimeouts[purpose])
    activeTimeouts[purpose] = null
  }
}

/**
 * Clear all active timeouts
 */
function clearAllTimeouts() {
  Object.keys(activeTimeouts).forEach((purpose) => {
    clearTimeout(purpose)
  })
}

module.exports = {
  setTimeout,
  clearTimeout,
  clearAllTimeouts,
}
