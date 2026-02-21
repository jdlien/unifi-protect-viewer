import * as uiController from './modules/uiController'
import * as buttons from './modules/buttons'
import * as navigation from './modules/navigation'
import * as cameras from './modules/cameras'
import * as ui from './modules/ui'
import { log, logError } from './modules/utils'
import * as timeouts from './modules/timeouts'
import * as buttonStyles from './modules/buttonStyles'

import { initializeUpdateListeners } from './modules/updates-renderer'
import { PROTECT_PAGE_POLL_MS, PROTECT_PAGE_MAX_WAIT_MS, UPDATE_LISTENER_DELAY_MS } from './modules/constants'

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

/**
 * Ensure all custom buttons are injected and registered with the controller.
 * Idempotent — safe to call repeatedly (e.g. after SPA navigation).
 */
async function ensureButtonsInjected(): Promise<void> {
  if (!window.location.href.includes('/protect/')) return

  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
  }

  if (!document.getElementById('sidebar-button')) {
    const updater = await buttons.injectSidebarButton(() => uiController.toggleNav())
    if (updater) uiController.registerButton('sidebar-button', updater)
  }
  if (!document.getElementById('header-toggle-button')) {
    const updater = await buttons.injectHeaderToggleButton(() => uiController.toggleHeader())
    if (updater) uiController.registerButton('header-toggle-button', updater)
  }
  if (!document.getElementById('fullscreen-button')) {
    const updater = await buttons.injectFullscreenButton(() => buttons.toggleFullscreen())
    if (updater) uiController.registerButton('fullscreen-button', updater)
  }
  await buttons.handleDashboardButton()
}

// Guard to ensure protect-page initialization only runs once
let protectPageInitialized = false

/**
 * Initialize the UI controller, buttons, and listeners for a /protect/ page.
 */
async function initializeProtectPage(): Promise<void> {
  if (protectPageInitialized) return
  protectPageInitialized = true

  log('Initializing protect page UI')

  try {
    await uiController.initialize()
  } catch (error) {
    logError('Failed to initialize UI controller', error)
  }

  buttonStyles.setupStyleChecker()

  try {
    await ensureButtonsInjected()
  } catch (error) {
    logError('Failed to inject buttons', error)
  }

  let dashboardUpdatePending = false
  uiController.onStateChange(async () => {
    if (dashboardUpdatePending) return
    dashboardUpdatePending = true
    try {
      await buttons.handleDashboardButton()
    } catch (err) {
      logError('Error updating dashboard button from state change:', err)
    } finally {
      dashboardUpdatePending = false
    }
  })

  cameras.setupHotkeyListener()

  uiController.onStateChange(() => {
    ensureButtonsInjected().catch((err: unknown) => {
      logError('Error in ensureButtonsInjected:', err)
    })
  })
}

/**
 * Watch for the URL to transition from a non-protect page (e.g. login) to a
 * /protect/ page, then run initializeProtectPage().
 */
function watchForProtectPageTransition(): void {
  const startTime = Date.now()
  const interval = setInterval(() => {
    if (Date.now() - startTime > PROTECT_PAGE_MAX_WAIT_MS) {
      clearInterval(interval)
      return
    }
    if (window.location.href.includes('/protect/')) {
      clearInterval(interval)
      initializeProtectPage().catch((err: unknown) => {
        logError('Failed to initialize protect page after login:', err)
      })
    }
  }, PROTECT_PAGE_POLL_MS)
}

window.addEventListener('DOMContentLoaded', async () => {
  log('Page loaded, URL:', window.location.href)
  timeouts.clearTimeout('connection')

  const currentUrl = window.location.href
  const isAppPage = !currentUrl.includes('/html/error.html') && !currentUrl.includes('/html/config.html')
  const isProtectPage = currentUrl.includes('/protect/')

  if (isAppPage) {
    navigation.initializeWithPolling()

    if (isProtectPage) {
      await initializeProtectPage()
    } else {
      watchForProtectPageTransition()
    }
  }

  setTimeout(() => {
    initializeUpdateListeners()
  }, UPDATE_LISTENER_DELAY_MS)

  ipcRenderer.on('toggle-navigation', () => {
    uiController.toggleAll().catch((error: unknown) => {
      logError('Error toggling navigation from menu:', error)
    })
  })

  ipcRenderer.on('toggle-nav-only', () => {
    uiController.toggleNav().catch((error: unknown) => {
      logError('Error toggling nav from menu:', error)
    })
  })

  ipcRenderer.on('toggle-header-only', () => {
    uiController.toggleHeader().catch((error: unknown) => {
      logError('Error toggling header from menu:', error)
    })
  })

  ipcRenderer.on('return-to-dashboard', () => {
    buttons.triggerDashboardNavigation()
  })

  ipcRenderer.on('zoom-camera', (_event: unknown, index: unknown) => {
    if (index === -1) {
      cameras.unzoomAll()
    } else {
      cameras.zoomToCamera(index as number)
    }
  })

  ipcRenderer.on('toggle-widget-panel', () => {
    ui.toggleWidgetPanel()
  })
})

// Expose API to renderer using modern structure
contextBridge.exposeInMainWorld('electronAPI', {
  config: {
    load: () => ipcRenderer.invoke('configLoad'),
    save: (config: Record<string, unknown>) => ipcRenderer.send('configSave', config),
  },

  app: {
    reset: () => ipcRenderer.send('reset'),
    restart: () => ipcRenderer.send('restart'),
    showResetConfirmation: () => ipcRenderer.invoke('showResetConfirmation'),
    getDiagnostics: () => ipcRenderer.invoke('getSystemDiagnostics'),
  },

  navigation: {
    loadURL: (url: string) => ipcRenderer.send('loadURL', url),
    updateDashboardState: (isDashboardPage: boolean) => ipcRenderer.send('update-dashboard-state', isDashboardPage),
  },

  ui: {
    toggleAll: () => uiController.toggleAll(),
    togglePageElements: () => uiController.toggleAll(),
    toggleNavOnly: () => uiController.toggleNav(),
    toggleHeaderOnly: () => uiController.toggleHeader(),
    toggleWidgetPanel: () => ui.toggleWidgetPanel(),
    returnToDashboard: () => buttons.triggerDashboardNavigation(),
  },

  updates: {
    onUpdateAvailable: (callback: (info: unknown) => void) =>
      ipcRenderer.on('update-available', (_: unknown, info: unknown) => callback(info)),
    onUpdateError: (callback: (message: unknown) => void) =>
      ipcRenderer.on('update-error', (_: unknown, message: unknown) => callback(message)),
    onDownloadProgress: (callback: (progress: unknown) => void) =>
      ipcRenderer.on('download-progress', (_: unknown, progress: unknown) => callback(progress)),
    onUpdateDownloaded: (callback: (info: unknown) => void) =>
      ipcRenderer.on('update-downloaded', (_: unknown, info: unknown) => callback(info)),
    checkForUpdates: () => ipcRenderer.invoke('updates:check-manual'),
    downloadUpdate: () => ipcRenderer.invoke('updates:download'),
    installUpdate: () => ipcRenderer.invoke('updates:install'),
  },

  timeouts: {
    setTrackedTimeout: timeouts.setTrackedTimeout,
    clearTimeout: timeouts.clearTimeout,
    clearAllTimeouts: timeouts.clearAllTimeouts,
  },

  reset: () => ipcRenderer.send('reset'),
  restart: () => ipcRenderer.send('restart'),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
})
