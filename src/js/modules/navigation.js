// Import the UI functions we need
const ui = require('./ui.js')
const utils = require('./utils.js')
const auth = require('./auth.js')
const dashboard = require('./dashboard.js')

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

      // Special handling for login-to-dashboard transition
      const isFromLogin = oldUrl.includes('login') || oldUrl.includes('signin') || oldUrl.includes('auth')
      const isToDashboard = window.location.href.includes('/protect/dashboard')

      // Check if we're on a dashboard page and update menu state
      const isDashboardPage = dashboard.isDashboardPage()

      // Handle different navigation scenarios
      if (isDashboardPage) {
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

      // No need to call initializeCommonUI here since the header persists in the React SPA
    }
  }

  // Apply dashboard customizations with retry mechanism
  const applyDashboardCustomizations = async () => {
    try {
      // Use the dashboard module instead of direct implementation
      const success = await dashboard.initializeDashboard()
      if (!success) {
        utils.log('Dashboard not ready yet, will retry')
        setTimeout(applyDashboardCustomizations, 500)
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

  // Initialize UI based on page readiness
  function initializeUI() {
    // Check if document is already interactive or complete
    if (document.readyState !== 'loading') {
      // DOM already ready, initialize immediately
      if (window.location.href.includes('/protect/dashboard')) {
        applyDashboardCustomizations()
      } else {
        ui.handleDashboardButton()
      }
      // Initialize common UI elements once during initial page load
      ui.initializeCommonUI()
    } else {
      // Wait for DOM to be ready before initializing
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (window.location.href.includes('/protect/dashboard')) {
            applyDashboardCustomizations()
          } else {
            ui.handleDashboardButton()
          }
          // Initialize common UI elements once during initial page load
          ui.initializeCommonUI()
        },
        { once: true },
      )
    }
  }

  // Replace the setTimeout call with the new function
  initializeUI()

  // The cleanup function is not currently used, but we'll improve it anyway
  // for future maintainability
  return () => {
    observer.disconnect()
    navigationEvents.forEach((event) => {
      window.removeEventListener(event, eventListeners[event])
    })
  }
} // End of setupNavigationMonitor

/**
 * Initialize the application based on the current page type
 * @returns {boolean} True if initialization was successful
 */
function initializePageByType() {
  // Check the current page type and initialize accordingly
  if (auth.isLoginPage()) {
    return auth.initializeLoginPage()
  } else if (window.location.href.includes('/protect/dashboard')) {
    // Set up navigation monitoring first
    setupNavigationMonitor()

    // Then initialize dashboard UI
    return ui.initializeDashboardPage()
  } else {
    // For other pages, just set up navigation monitoring
    setupNavigationMonitor()
    return true
  }
} // End of initializePageByType

/**
 * Initialize page with readiness polling if needed
 */
function initializeWithPolling() {
  // First attempt at initialization
  if (!initializePageByType()) {
    // If not ready, poll until ready
    requestAnimationFrame(function pollForPageReady() {
      if (!initializePageByType()) {
        requestAnimationFrame(pollForPageReady)
      }
    })
  }
} // End of initializeWithPolling

module.exports = {
  setupNavigationMonitor,
  initializePageByType,
  initializeWithPolling,
}
