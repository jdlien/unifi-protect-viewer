const ui = require('./ui.js')
const utils = require('./utils.js')
const auth = require('./auth.js')
const dashboard = require('./dashboard.js')
const { DASHBOARD_RETRY_DELAY_MS } = require('./constants')

// Guard to prevent duplicate monitor setup
let monitorSetup = false

/**
 * Setup navigation monitoring to detect URL changes in SPA.
 * Delegates UI state enforcement and button injection to uiController (via handleUrlChange)
 * and preload.js (via onStateChange listener).
 * Idempotent — safe to call multiple times, only creates one monitor.
 * @returns {Function} Cleanup function
 */
function setupNavigationMonitor() {
  if (monitorSetup) return () => {}
  monitorSetup = true

  let lastUrl = window.location.href

  const applyDashboardCustomizations = async () => {
    try {
      const success = await dashboard.initializeDashboard()
      if (!success) {
        utils.log('Dashboard not ready yet, will retry')
        setTimeout(applyDashboardCustomizations, DASHBOARD_RETRY_DELAY_MS)
      }
    } catch (error) {
      utils.logError('Error applying dashboard customizations:', error)
    }
  }

  const handleURLChange = () => {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl
      lastUrl = window.location.href

      const isProtectPage = window.location.href.includes('/protect/')
      const onDashboard = dashboard.isDashboardPage()

      // Notify main process about dashboard state (for menu updates)
      dashboard.notifyDashboardState()

      if (onDashboard) {
        utils.log('Dashboard page detected, applying UI customizations')

        auth.resetLoginAttempts().catch((err) => {
          utils.logError('Failed to reset login attempts counter:', err)
        })

        applyDashboardCustomizations()
      }

      // Notify the controller about URL change (lazy require to avoid circular deps)
      if (isProtectPage) {
        const uiController = require('./uiController')
        uiController.handleUrlChange(oldUrl, window.location.href)
      }
    }
  }

  // Single MutationObserver to watch for DOM changes that might indicate navigation
  const observer = new MutationObserver(() => handleURLChange())

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  })

  // Single event listener for all navigation-related events
  const navigationEvents = ['popstate', 'hashchange']
  const eventListeners = {}

  navigationEvents.forEach((event) => {
    const listener = () => handleURLChange()
    eventListeners[event] = listener
    window.addEventListener(event, listener)
  })

  return () => {
    observer.disconnect()
    navigationEvents.forEach((event) => {
      window.removeEventListener(event, eventListeners[event])
    })
    monitorSetup = false
  }
}

/**
 * Handle first-render setup for the current page.
 * Detects the page type (login, dashboard, protect) and applies appropriate initialization.
 * @returns {boolean} True if initialization was successful or page was recognized
 */
function initializeCurrentPage() {
  if (auth.isLoginPage()) {
    return auth.initializeLoginPage()
  }

  if (window.location.href.includes('/protect/dashboard')) {
    return ui.initializeDashboardPage()
  }

  if (window.location.href.includes('/protect/')) {
    return true
  }

  return false
}

/**
 * Initialize navigation: set up the URL change monitor once, then handle
 * the current page with polling if needed.
 */
function initializeWithPolling() {
  // 1. Set up navigation monitor once (watches for future URL changes)
  setupNavigationMonitor()

  // 2. Handle first-render setup for the current page
  if (!initializeCurrentPage()) {
    requestAnimationFrame(function pollForPageReady() {
      if (!initializeCurrentPage()) {
        requestAnimationFrame(pollForPageReady)
      }
    })
  }
}

module.exports = {
  setupNavigationMonitor,
  initializeCurrentPage,
  initializeWithPolling,
}
