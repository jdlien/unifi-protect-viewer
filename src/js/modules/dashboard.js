// Import required modules
const utils = require('./utils.js')
const ui = require('./ui.js')
const buttons = require('./buttons.js')
const { ipcRenderer } = require('electron')

/**
 * Check if dashboard is ready by waiting for LiveView to be loaded
 * @returns {Promise<boolean>} Promise resolving to true when LiveView is ready
 */
async function waitForDashboardReady() {
  try {
    await utils.waitUntil(
      () =>
        document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0 &&
        document.querySelectorAll('[class^=dashboard__Content]').length > 0,
    )

    return true
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
    ui.handleLiveView()

    // Update dashboard button state - use buttons module instead of ui
    buttons.handleDashboardButton().catch((err) => utils.logError('Error handling dashboard button:', err))

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
  const isOnDashboard = window.location.href.includes('/protect/dashboard')
  // Report status to main process for menu state update
  try {
    ipcRenderer.send('update-dashboard-state', isOnDashboard)
  } catch (error) {
    // Silently ignore errors as this is just a UI enhancement
  }
  return isOnDashboard
}

module.exports = {
  waitForDashboardReady,
  initializeDashboard,
  isDashboardPage,
}
