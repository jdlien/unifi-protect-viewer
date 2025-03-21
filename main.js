// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const version = require('./src/js/modules/version')
const utils = require('./src/js/modules/utils')
const updates = require('./src/js/modules/updates')
const windowManager = require('./src/js/modules/window')
const ipcManager = require('./src/js/modules/ipc')
const menuManager = require('./src/js/modules/menu')

// Enable hot reloading in development mode
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reloader')(module, {
      ignore: ['node_modules', 'builds', 'releases'],
    })
    utils.log('Electron hot reloading enabled')
  } catch (err) {
    console.error('Failed to enable hot reloading:', err)
  }
}

// Store initialization
let store
const resetRequested = process.argv.includes('--reset')

// Initialize store
async function initializeStore() {
  try {
    const Store = (await import('electron-store')).default
    store = new Store()
    if (resetRequested) {
      store.clear()
    }
  } catch (error) {
    console.error('Failed to initialize store:', error)
    // Create a memory-only store as fallback
    store = {
      get: (key) => null,
      set: () => {},
      clear: () => {},
      store: {},
    }
  }
}

// Wait until Electron app is ready
async function start() {
  await app.whenReady()
  await initializeStore()

  const mainWindow = await windowManager.createWindow(store)
  ipcManager.setupIpcHandlers(mainWindow, store)

  // Initialize update system with error handling
  try {
    updates.initialize(mainWindow)
  } catch (error) {
    utils.logError('Error initializing auto-update system:', error)
  }

  // Set up application menu
  menuManager.setupApplicationMenu(mainWindow, store)
}

// Start the app
start().catch((error) => {
  // Always log critical errors to console regardless of environment
  console.error('Error starting app:', error)
})
