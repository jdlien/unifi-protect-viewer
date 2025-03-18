const { contextBridge, ipcRenderer } = require('electron')
const isDev = process.env.NODE_ENV === 'development'

const ui = require('./modules/ui.js')
const navigation = require('./modules/navigation.js')
const utils = require('./modules/utils.js')
const timeouts = require('./modules/timeouts.js')

window.addEventListener('DOMContentLoaded', () => {
  utils.log('Page loaded, URL:', window.location.href)
  timeouts.clearTimeout('connection')
  navigation.initializeWithPolling()
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
  reset: () => ipcRenderer.send('reset'),
  restart: () => ipcRenderer.send('restart'),
})
