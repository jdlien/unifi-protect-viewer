const { contextBridge, ipcRenderer } = require('electron')
const isDev = process.env.NODE_ENV === 'development'

const ui = require('./modules/ui.js')
const navigation = require('./modules/navigation.js')
const utils = require('./modules/utils.js')
const timeouts = require('./modules/timeouts.js')

// Only import renderer-specific functions from updates module
// to avoid loading electron-updater in the renderer process
const {
  initializeUpdateListeners,
  showUpdateNotification,
  removeUpdateNotification,
  checkForUpdates,
} = require('./modules/updates.js')

window.addEventListener('DOMContentLoaded', () => {
  utils.log('Page loaded, URL:', window.location.href)
  timeouts.clearTimeout('connection')
  navigation.initializeWithPolling()
  ui.setupKeyboardShortcuts()

  // Initialize updates - after a delay to ensure UI is ready
  setTimeout(() => {
    initializeUpdateListeners()
  }, 5000)

  // Listen for toggle-navigation events from the main process
  ipcRenderer.on('toggle-navigation', () => {
    ui.toggleNavigation().catch((error) => {
      utils.logError('Error toggling navigation from menu:', error)
    })
  })

  // Listen for return-to-dashboard events from the main process
  ipcRenderer.on('return-to-dashboard', () => {
    ui.triggerDashboardNavigation()
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
  },

  // Navigation
  navigation: {
    loadURL: (url) => ipcRenderer.send('loadURL', url),
    updateDashboardState: (isDashboardPage) => ipcRenderer.send('update-dashboard-state', isDashboardPage),
  },

  // UI controls
  ui: {
    toggleNavigation: () => ui.toggleNavigation(),
    returnToDashboard: () => ui.triggerDashboardNavigation(),
  },

  // Update management
  updates: {
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (_, message) => callback(message)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    installUpdate: () => ipcRenderer.send('install-update'),
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

  // App version - accessed by About page
  appVersion: ipcRenderer.sendSync('get-app-version'),
})
