import { waitUntil, log, logError } from './utils'

const { ipcRenderer } = require('electron') as typeof import('electron')

/**
 * Check if dashboard is ready by waiting for LiveView to be loaded
 */
export async function waitForDashboardReady(): Promise<boolean> {
  try {
    await waitUntil(
      () =>
        document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0 &&
        document.querySelectorAll('[class^=dashboard__Content]').length > 0,
    )

    return true
  } catch (error) {
    logError('Error waiting for LiveView readiness:', error)
    return false
  }
}

/**
 * Initialize the dashboard and apply customizations
 */
export async function initializeDashboard(): Promise<boolean> {
  try {
    const isReady = await waitForDashboardReady()

    if (!isReady) {
      log('LiveView not ready yet')
      return false
    }

    log('LiveView is ready, applying customizations')

    const ui = require('./ui') as typeof import('./ui')
    ui.handleLiveView()

    const buttons = require('./buttons') as typeof import('./buttons')
    buttons.handleDashboardButton().catch((err: unknown) => logError('Error handling dashboard button:', err))

    const cameras = require('./cameras') as typeof import('./cameras')
    cameras.detectCameras()

    return true
  } catch (error) {
    logError('Error initializing dashboard:', error)
    return false
  }
}

/**
 * Check if the current page is a dashboard page (pure — no side effects)
 */
export function isDashboardPage(): boolean {
  return window.location.href.includes('/protect/dashboard')
}

/**
 * Notify the main process about the current dashboard state.
 * Call this explicitly from navigation monitors, not from isDashboardPage().
 */
export function notifyDashboardState(): void {
  try {
    ipcRenderer.send('update-dashboard-state', isDashboardPage())
  } catch {
    // Silently ignore errors as this is just a UI enhancement
  }
}
