// Import the UI functions we need
const ui = require('./ui.js')
const utils = require('./utils.js')
const auth = require('./auth.js')

/**
 * Setup navigation monitoring to detect URL changes in SPA
 * @returns {Function} Cleanup function
 */
function setupNavigationMonitor() {
  // Track the last known URL to prevent duplicate handling
  let lastUrl = window.location.href

  // Create a function for URL change handling to avoid duplication
  const handleURLChange = () => {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl
      lastUrl = window.location.href
      utils.log('Navigation detected:', oldUrl, '->', lastUrl)

      // Handle different navigation scenarios
      if (lastUrl.includes('/protect/dashboard')) {
        // Navigated to dashboard - this means login was successful
        utils.log('Dashboard page detected, applying UI customizations')

        // Reset login attempts counter on successful login
        auth.resetLoginAttempts().catch((err) => {
          utils.logError('Failed to reset login attempts counter:', err)
        })

        applyDashboardCustomizations()
      } else {
        // For non-dashboard pages, just update the dashboard button
        ui.handleDashboardButton()
      }
    }
  }

  // Apply dashboard customizations with retry mechanism
  const applyDashboardCustomizations = async () => {
    try {
      // First check if LiveView is already ready
      const isReady = await utils.waitForLiveViewReady().catch(() => false)

      if (isReady) {
        utils.log('LiveView is ready, applying customizations')
        ui.handleLiveviewV5()
        ui.handleDashboardButton()
      } else {
        utils.log('LiveView not ready yet, will retry')
        // If not ready, try again in a moment
        setTimeout(applyDashboardCustomizations, 1000)
      }
    } catch (error) {
      utils.logError('Error applying dashboard customizations:', error)
    }
  }

  // Single MutationObserver to watch for DOM changes that might indicate navigation
  const observer = new MutationObserver(() => handleURLChange())

  // Configure the observer with more specific targets
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false, // Don't watch for attribute changes
    characterData: false, // Don't watch for text content changes
  })

  // Single event listener for all navigation-related events
  const navigationEvents = ['popstate', 'hashchange']
  const eventListeners = {}

  navigationEvents.forEach((event) => {
    // Store reference to the listener function for proper removal
    const listener = () => handleURLChange()
    eventListeners[event] = listener
    window.addEventListener(event, listener)
  })

  // Initial call to set up UI
  setTimeout(() => {
    if (window.location.href.includes('/protect/dashboard')) {
      applyDashboardCustomizations()
    } else {
      ui.handleDashboardButton()
    }
  }, 1000)

  // The cleanup function is not currently used, but we'll improve it anyway
  // for future maintainability
  return () => {
    observer.disconnect()
    navigationEvents.forEach((event) => {
      window.removeEventListener(event, eventListeners[event])
    })
  }
}

module.exports = {
  setupNavigationMonitor,
}
