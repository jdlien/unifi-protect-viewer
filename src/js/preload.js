const { contextBridge, ipcRenderer } = require('electron')
const isDev = process.env.NODE_ENV === 'development'

// Import modules
const auth = require('./modules/auth.js')
const ui = require('./modules/ui.js')
const navigation = require('./modules/navigation.js')
const utils = require('./modules/utils.js')
const timeouts = require('./modules/timeouts.js')

// Run initialization when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  utils.log('Page loaded, URL:', window.location.href)

  // Clear any connection timeouts when loading a new page
  timeouts.clearTimeout('connection')

  // Initialize the appropriate page behavior
  navigation.initializeWithPolling()

  // Set up keyboard shortcuts
  ui.setupKeyboardShortcuts()
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
  },

  // Navigation
  navigation: {
    loadURL: (url) => ipcRenderer.send('loadURL', url),
  },

  // UI controls
  ui: {
    toggleNavigation: ui.toggleNavigation,
  },

  // Timeout management
  timeouts: {
    setTrackedTimeout: timeouts.setTrackedTimeout,
    clearTimeout: timeouts.clearTimeout,
    clearAllTimeouts: timeouts.clearAllTimeouts,
  },

  // Backward compatibility functions
  getURL: () => ipcRenderer.invoke('getURL'), // DEPRECATED: Use config.load() instead
  reset: () => ipcRenderer.send('reset'),
  restart: () => ipcRenderer.send('restart'),
})
