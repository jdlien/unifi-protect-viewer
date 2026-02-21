const { contextBridge, ipcRenderer } = require('electron')

const uiController = require('./modules/uiController.js')
const buttons = require('./modules/buttons.js')
const navigation = require('./modules/navigation.js')
const cameras = require('./modules/cameras.js')
const ui = require('./modules/ui.js')
const utils = require('./modules/utils.js')
const timeouts = require('./modules/timeouts.js')
const buttonStyles = require('./modules/buttonStyles.js')

// Renderer-only update functions (notification UI, progress bar)
const { initializeUpdateListeners } = require('./modules/updates-renderer.js')
const { PROTECT_PAGE_POLL_MS, PROTECT_PAGE_MAX_WAIT_MS, UPDATE_LISTENER_DELAY_MS } = require('./modules/constants')

/**
 * Ensure all custom buttons are injected and registered with the controller.
 * Idempotent — safe to call repeatedly (e.g. after SPA navigation).
 */
async function ensureButtonsInjected() {
  if (!window.location.href.includes('/protect/')) return

  // Ensure styles
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
  }

  // Re-inject + re-register any missing buttons
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
 * Called either at DOMContentLoaded (if already on a protect page) or after
 * login redirects to a protect page. Guarded to run only once.
 */
async function initializeProtectPage() {
  if (protectPageInitialized) return
  protectPageInitialized = true

  utils.log('Initializing protect page UI')

  // 1. Initialize the controller (loads config, sets state, waits for DOM, enforces, sets up observer)
  try {
    await uiController.initialize()
  } catch (error) {
    utils.logError('Failed to initialize UI controller', error)
  }

  // 2. Start the button style checker
  buttonStyles.setupStyleChecker()

  // 3. Inject buttons and register updaters with the controller
  try {
    await ensureButtonsInjected()
  } catch (error) {
    utils.logError('Failed to inject buttons', error)
  }

  // 4. Register dashboard button as state change listener (with async hygiene)
  let dashboardUpdatePending = false
  uiController.onStateChange(async () => {
    if (dashboardUpdatePending) return
    dashboardUpdatePending = true
    try {
      await buttons.handleDashboardButton()
    } catch (err) {
      utils.logError('Error updating dashboard button from state change:', err)
    } finally {
      dashboardUpdatePending = false
    }
  })

  // 5. Set up camera hotkey listener (bare number keys for zoom)
  cameras.setupHotkeyListener()

  // 6. Register URL-change-aware listener for button re-injection
  uiController.onStateChange(() => {
    ensureButtonsInjected().catch((err) => {
      utils.logError('Error in ensureButtonsInjected:', err)
    })
  })
}

/**
 * Watch for the URL to transition from a non-protect page (e.g. login) to a
 * /protect/ page, then run initializeProtectPage(). Polls every 500ms for up
 * to 120 seconds.
 */
function watchForProtectPageTransition() {
  const startTime = Date.now()
  const interval = setInterval(() => {
    if (Date.now() - startTime > PROTECT_PAGE_MAX_WAIT_MS) {
      clearInterval(interval)
      return
    }
    if (window.location.href.includes('/protect/')) {
      clearInterval(interval)
      initializeProtectPage().catch((err) => {
        utils.logError('Failed to initialize protect page after login:', err)
      })
    }
  }, PROTECT_PAGE_POLL_MS)
}

window.addEventListener('DOMContentLoaded', async () => {
  utils.log('Page loaded, URL:', window.location.href)
  timeouts.clearTimeout('connection')

  const currentUrl = window.location.href
  const isAppPage = !currentUrl.includes('/html/error.html') && !currentUrl.includes('/html/config.html')
  const isProtectPage = currentUrl.includes('/protect/')

  if (isAppPage) {
    navigation.initializeWithPolling()

    if (isProtectPage) {
      await initializeProtectPage()
    } else {
      // Not on a protect page yet (e.g. login page) — watch for redirect
      watchForProtectPageTransition()
    }
  }

  // Initialize updates - after a delay to ensure UI is ready
  setTimeout(() => {
    initializeUpdateListeners()
  }, UPDATE_LISTENER_DELAY_MS)

  // Route IPC toggle events through the controller
  ipcRenderer.on('toggle-navigation', () => {
    uiController.toggleAll().catch((error) => {
      utils.logError('Error toggling navigation from menu:', error)
    })
  })

  ipcRenderer.on('toggle-nav-only', () => {
    uiController.toggleNav().catch((error) => {
      utils.logError('Error toggling nav from menu:', error)
    })
  })

  ipcRenderer.on('toggle-header-only', () => {
    uiController.toggleHeader().catch((error) => {
      utils.logError('Error toggling header from menu:', error)
    })
  })

  // Listen for return-to-dashboard events from the main process
  ipcRenderer.on('return-to-dashboard', () => {
    buttons.triggerDashboardNavigation()
  })

  // Listen for camera zoom requests from the main process (Cameras menu)
  ipcRenderer.on('zoom-camera', (event, index) => {
    if (index === -1) {
      cameras.unzoomAll()
    } else {
      cameras.zoomToCamera(index)
    }
  })

  // Listen for toggle-widget-panel events from the main process
  ipcRenderer.on('toggle-widget-panel', () => {
    ui.toggleWidgetPanel()
  })
})

// Expose API to renderer using modern structure
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration management
  config: {
    load: () => ipcRenderer.invoke('configLoad'),
    save: (config) => ipcRenderer.send('configSave', config),
  },

  // App management
  app: {
    reset: () => ipcRenderer.send('reset'),
    restart: () => ipcRenderer.send('restart'),
    showResetConfirmation: () => ipcRenderer.invoke('showResetConfirmation'),
    getDiagnostics: () => ipcRenderer.invoke('getSystemDiagnostics'),
  },

  // Navigation
  navigation: {
    loadURL: (url) => ipcRenderer.send('loadURL', url),
    updateDashboardState: (isDashboardPage) => ipcRenderer.send('update-dashboard-state', isDashboardPage),
  },

  // UI controls
  ui: {
    toggleAll: () => uiController.toggleAll(),
    togglePageElements: () => uiController.toggleAll(), // backward compat alias
    toggleNavOnly: () => uiController.toggleNav(),
    toggleHeaderOnly: () => uiController.toggleHeader(),
    toggleWidgetPanel: () => ui.toggleWidgetPanel(),
    returnToDashboard: () => buttons.triggerDashboardNavigation(),
  },

  // Update management
  updates: {
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (_, message) => callback(message)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
    checkForUpdates: () => ipcRenderer.invoke('updates:check-manual'),
    downloadUpdate: () => ipcRenderer.invoke('updates:download'),
    installUpdate: () => ipcRenderer.invoke('updates:install'),
  },

  // Timeout management
  timeouts: {
    setTrackedTimeout: timeouts.setTrackedTimeout,
    clearTimeout: timeouts.clearTimeout,
    clearAllTimeouts: timeouts.clearAllTimeouts,
  },

  // Backward compatibility functions
  reset: () => ipcRenderer.send('reset'),
  restart: () => ipcRenderer.send('restart'),

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
})
