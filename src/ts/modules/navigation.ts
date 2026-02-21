import { log, logError } from './utils'
import * as auth from './auth'
import * as dashboard from './dashboard'
import { DASHBOARD_RETRY_DELAY_MS } from './constants'

// Guard to prevent duplicate monitor setup
let monitorSetup = false

/**
 * Setup navigation monitoring to detect URL changes in SPA.
 * Delegates UI state enforcement and button injection to uiController (via handleUrlChange)
 * and preload.ts (via onStateChange listener).
 * Idempotent — safe to call multiple times, only creates one monitor.
 */
export function setupNavigationMonitor(): () => void {
  if (monitorSetup) return () => {}
  monitorSetup = true

  let lastUrl = window.location.href

  const applyDashboardCustomizations = async (): Promise<void> => {
    try {
      const success = await dashboard.initializeDashboard()
      if (!success) {
        log('Dashboard not ready yet, will retry')
        setTimeout(applyDashboardCustomizations, DASHBOARD_RETRY_DELAY_MS)
      }
    } catch (error) {
      logError('Error applying dashboard customizations:', error)
    }
  }

  const handleURLChange = (): void => {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl
      lastUrl = window.location.href

      const isProtectPage = window.location.href.includes('/protect/')
      const onDashboard = dashboard.isDashboardPage()

      dashboard.notifyDashboardState()

      if (onDashboard) {
        log('Dashboard page detected, applying UI customizations')

        auth.resetLoginAttempts().catch((err: unknown) => {
          logError('Failed to reset login attempts counter:', err)
        })

        applyDashboardCustomizations()
      }

      // Notify the controller about URL change (lazy require to avoid circular deps)
      if (isProtectPage) {
        const uiController = require('./uiController') as typeof import('./uiController')
        uiController.handleUrlChange(oldUrl, window.location.href)
      }
    }
  }

  const observer = new MutationObserver(() => handleURLChange())

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  })

  const navigationEvents = ['popstate', 'hashchange'] as const
  const eventListeners: Record<string, () => void> = {}

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
 */
export function initializeCurrentPage(): boolean {
  if (auth.isLoginPage()) {
    return auth.initializeLoginPage()
  }

  if (window.location.href.includes('/protect/dashboard')) {
    const ui = require('./ui') as typeof import('./ui')
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
export function initializeWithPolling(): void {
  setupNavigationMonitor()

  if (!initializeCurrentPage()) {
    requestAnimationFrame(function pollForPageReady() {
      if (!initializeCurrentPage()) {
        requestAnimationFrame(pollForPageReady)
      }
    })
  }
}
