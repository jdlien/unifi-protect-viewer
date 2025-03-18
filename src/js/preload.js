const { contextBridge, ipcRenderer } = require('electron')

// Import modules
const auth = require('./modules/auth.js')
const ui = require('./modules/ui.js')
const navigation = require('./modules/navigation.js')
const utils = require('./modules/utils.js')

// Run initialization to setup automatic fullscreen and navigation
window.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, URL:', window.location.href)

  // Clear any connection timeout that might exist from the config page
  if (window.connectionTimeoutId) {
    clearTimeout(window.connectionTimeoutId)
    window.connectionTimeoutId = null
  }

  // Use a more intelligent approach to detect page readiness
  const checkPageReady = () => {
    if (auth.isLoginPage()) {
      // For login page: check if the login form elements are rendered
      const loginElements = document.querySelector('form input[type="password"]')
      if (loginElements) {
        // console.log('Login page fully loaded, attempting auto-login')
        auth.attemptLogin()
        return true
      }
    } else {
      // For other pages
      navigation.setupNavigationMonitor()

      // Check if we're on the dashboard
      if (document.URL.includes('/protect/dashboard')) {
        // Use existing utils function for liveview readiness
        utils
          .waitForLiveViewReady()
          .then(() => {
            ui.handleLiveviewV5()
          })
          .catch((error) => {
            console.error('Error setting up UI customizations:', error)
          })
        return true
      } else {
        // For non-dashboard pages, we can consider them ready now
        return true
      }
    }

    // If we reach here, the page isn't ready yet
    return false
  }

  // Check if the page is ready immediately
  if (!checkPageReady()) {
    // If not ready, use requestAnimationFrame to check again
    const waitForPageReady = () => {
      if (!checkPageReady()) {
        requestAnimationFrame(waitForPageReady)
      }
    }
    requestAnimationFrame(waitForPageReady)
  }
})

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
