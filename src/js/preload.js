const { contextBridge, ipcRenderer } = require('electron')
const isDev = process.env.NODE_ENV === 'development'

// Import modules
const auth = require('./modules/auth.js')
const ui = require('./modules/ui.js')
const navigation = require('./modules/navigation.js')
const utils = require('./modules/utils.js')

// Run initialization to setup automatic fullscreen and navigation
window.addEventListener('DOMContentLoaded', () => {
  utils.log('Page loaded, URL:', window.location.href)

  // Clear any connection timeout that might exist from the config page
  if (window.connectionTimeoutId) {
    clearTimeout(window.connectionTimeoutId)
    window.connectionTimeoutId = null
  }

  // Check page type and initialize appropriate behaviors
  if (!initializePageByType()) {
    // If not ready, poll until ready
    requestAnimationFrame(function pollForPageReady() {
      if (!initializePageByType()) {
        requestAnimationFrame(pollForPageReady)
      }
    })
  }

  // Watch for navigation changes, especially after login redirects
  setupNavigationObserver()
})

// Watch for URL changes after login redirects to dashboard
function setupNavigationObserver() {
  let lastUrl = window.location.href

  // Function to check if we've navigated to the dashboard
  const checkForDashboard = () => {
    if (window.location.href !== lastUrl) {
      utils.log('URL changed from', lastUrl, 'to', window.location.href)
      lastUrl = window.location.href

      // If we've navigated to the dashboard, initialize it
      if (window.location.href.includes('/protect/dashboard')) {
        utils.log('Detected navigation to dashboard, initializing UI')
        initializeDashboardPage()
      }
    }
  }

  // Set up various ways to detect navigation

  // 1. History API
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function () {
    originalPushState.apply(this, arguments)
    checkForDashboard()
  }

  history.replaceState = function () {
    originalReplaceState.apply(this, arguments)
    checkForDashboard()
  }

  // 2. Listen for popstate events
  window.addEventListener('popstate', checkForDashboard)

  // 3. Check periodically for a short time after login
  // This handles cases where the other methods don't catch the transition
  let checkCount = 0
  const maxChecks = 20 // Check for 10 seconds maximum

  const intervalCheck = setInterval(() => {
    checkForDashboard()
    checkCount++

    if (checkCount >= maxChecks) {
      clearInterval(intervalCheck)
    }
  }, 500)
}

// Separate functions by page type
function initializePageByType() {
  if (auth.isLoginPage()) {
    return initializeLoginPage()
  } else if (document.URL.includes('/protect/dashboard')) {
    return initializeDashboardPage()
  } else {
    // For non-dashboard pages
    navigation.setupNavigationMonitor()
    return true
  }
}

function initializeLoginPage() {
  const loginElements = document.querySelector('form input[type="password"]')
  if (loginElements) {
    auth.attemptLogin()
    return true
  }
  return false
}

function initializeDashboardPage() {
  navigation.setupNavigationMonitor()

  // Setup UI customizations when liveview is ready
  try {
    utils
      .waitForLiveViewReady()
      .then(() => {
        try {
          ui.handleLiveviewV5()
        } catch (error) {
          utils.logError('Error in UI customizations:', error)
        }
      })
      .catch((error) => {
        utils.logError('Error waiting for liveview:', error)
      })
    return true
  } catch (error) {
    utils.logError('Error initializing dashboard:', error)
    return false
  }
}

// Set up key event handlers with modern practices
const handleKeyDown = (event) => {
  // F10 for reset
  if (event.key === 'F10') {
    if (event.shiftKey) {
      // Force reset with Shift+F10
      ipcRenderer.send('reset')
      ipcRenderer.send('restart')
    } else {
      // Show confirmation dialog
      ipcRenderer.invoke('showResetConfirmation').then((confirmed) => {
        if (confirmed) {
          ipcRenderer.send('reset')
          ipcRenderer.send('restart')
        }
      })
    }
  }

  // F9 for restart
  if (event.key === 'F9') {
    ipcRenderer.send('restart')
  }

  // Escape to toggle UI elements
  if (event.key === 'Escape') {
    // Unsure if this is needed but for some reason the page was reloading when the escape key was pressed
    event.preventDefault()
    ui.toggleNavigation()
  }
}

window.addEventListener('keydown', handleKeyDown)

// Expose API to renderer using modern structure
contextBridge.exposeInMainWorld('electronAPI', {
  config: {
    load: () => ipcRenderer.invoke('configLoad'),
    save: (config) => ipcRenderer.send('configSave', config),
  },

  app: {
    reset: () => ipcRenderer.send('reset'),
    restart: () => ipcRenderer.send('restart'),
    showResetConfirmation: () => ipcRenderer.invoke('showResetConfirmation'),
  },

  navigation: {
    loadURL: (url) => ipcRenderer.send('loadURL', url),
  },

  ui: {
    toggleNavigation: ui.toggleNavigation,
  },
})
