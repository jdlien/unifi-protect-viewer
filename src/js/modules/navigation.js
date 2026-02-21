const ui = require('./ui.js')
const utils = require('./utils.js')
const auth = require('./auth.js')
const dashboard = require('./dashboard.js')

/**
 * Setup navigation monitoring to detect URL changes in SPA.
 * Delegates UI state enforcement and button injection to uiController (via handleUrlChange)
 * and preload.js (via onStateChange listener).
 * @returns {Function} Cleanup function
 */
function setupNavigationMonitor() {
  let lastUrl = window.location.href

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

  const applyDashboardCustomizations = async () => {
    try {
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

  // Initialize UI based on page readiness
  function initializeUI() {
    if (document.readyState !== 'loading') {
      if (window.location.href.includes('/protect/dashboard')) {
        applyDashboardCustomizations()
      }
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (window.location.href.includes('/protect/dashboard')) {
            applyDashboardCustomizations()
          }
        },
        { once: true },
      )
    }
  }

  initializeUI()

  return () => {
    observer.disconnect()
    navigationEvents.forEach((event) => {
      window.removeEventListener(event, eventListeners[event])
    })
  }
}

/**
 * Initialize the application based on the current page type
 * @returns {boolean} True if initialization was successful
 */
function initializePageByType() {
  if (auth.isLoginPage()) {
    return auth.initializeLoginPage()
  } else if (window.location.href.includes('/protect/dashboard')) {
    setupNavigationMonitor()
    return ui.initializeDashboardPage()
  } else if (window.location.href.includes('/protect/')) {
    setupNavigationMonitor()
    return true
  } else {
    setupNavigationMonitor()
    return true
  }
}

/**
 * Initialize page with readiness polling if needed
 */
function initializeWithPolling() {
  if (!initializePageByType()) {
    requestAnimationFrame(function pollForPageReady() {
      if (!initializePageByType()) {
        requestAnimationFrame(pollForPageReady)
      }
    })
  }
}

module.exports = {
  setupNavigationMonitor,
  initializePageByType,
  initializeWithPolling,
}
