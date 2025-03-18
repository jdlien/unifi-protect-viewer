// Import required modules
const utils = require('./utils.js')
const ui = require('./ui.js')

/**
 * Check if dashboard is ready by waiting for LiveView to be loaded
 * @returns {Promise<boolean>} Promise resolving to true when LiveView is ready
 */
async function waitForDashboardReady() {
  try {
    return await utils.waitForLiveViewReady()
  } catch (error) {
    utils.logError('Error waiting for LiveView readiness:', error)
    return false
  }
}

/**
 * Initialize the dashboard and apply customizations
 * @returns {Promise<boolean>} Promise resolving to true if initialized successfully
 */
async function initializeDashboard() {
  try {
    // Wait for dashboard to be ready
    const isReady = await waitForDashboardReady()

    if (!isReady) {
      utils.log('LiveView not ready yet')
      return false
    }

    utils.log('LiveView is ready, applying customizations')

    // Apply UI customizations
    ui.handleLiveviewV5()

    // Update dashboard button state
    ui.handleDashboardButton()

    return true
  } catch (error) {
    utils.logError('Error initializing dashboard:', error)
    return false
  }
}

/**
 * Check if the current page is a dashboard page
 * @returns {boolean} True if current page is a dashboard
 */
function isDashboardPage() {
  return window.location.href.includes('/protect/dashboard')
}

module.exports = {
  waitForDashboardReady,
  initializeDashboard,
  isDashboardPage,
}
