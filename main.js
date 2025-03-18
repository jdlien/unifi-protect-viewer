// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const chromeVersion = require('./src/config/chrome-version')

// Constants
const DEFAULT_WIDTH = 1270
const DEFAULT_HEIGHT = 750
const isDev = process.env.NODE_ENV === 'development'

// Utility function for logging
function log(...args) {
  if (isDev) {
    console.log(...args)
  }
}

// Enable hot reloading in development mode
if (isDev) {
  try {
    require('electron-reloader')(module, {
      ignore: ['node_modules', 'builds', 'releases'],
    })
    log('Electron hot reloading enabled')
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

// Configure any custom app behavior
function configureApp() {
  // Disable hardware acceleration if requested by config
  if (store.get('disableHardwareAcceleration')) {
    app.disableHardwareAcceleration()
    log('Hardware acceleration disabled')
  }
}

// Create the browser window.
async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: store.get('bounds')?.width || DEFAULT_WIDTH,
    height: store.get('bounds')?.height || DEFAULT_HEIGHT,
    x: store.get('bounds')?.x || undefined,
    y: store.get('bounds')?.y || undefined,
    webPreferences: {
      preload: path.join(__dirname, '/src/js/preload.js'),
      contextIsolation: true, // Enable security
      nodeIntegration: false, // Disable direct access
      spellcheck: false,
      sandbox: false, // Needed for some functionality
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '/src/img/128.png'),
    frame: true,
    autoHideMenuBar: true,
  })

  // Set custom user agent using dynamic values from chrome-version
  mainWindow.webContents.setUserAgent(chromeVersion.userAgent)

  // Set window title
  mainWindow.setTitle(`UniFi Protect Viewer ${app.getVersion()}`)

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  // Save window position/size on close
  mainWindow.on('close', () => {
    store.set('bounds', mainWindow.getBounds())
  })

  // Load the initial URL
  const initialUrl = store.get('url') || 'about:blank'
  log(`Loading initial URL: ${initialUrl}`)
  mainWindow.loadURL(initialUrl)

  // If no URL is set, navigate to the config page
  if (initialUrl === 'about:blank') {
    const configUrl = `file://${path.join(__dirname, 'src/html/config.html')}`
    mainWindow.loadURL(configUrl)
  }

  // Handle external links securely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    log(`Window open request for ${url}`)

    // Only allow navigation to URLs with expected protocols/domains
    // For the UniFi Protect application, we should only allow URLs related to the Protect system
    if (url.startsWith(store.get('url') || '') || url.startsWith('file://')) {
      mainWindow.loadURL(url)
    } else {
      log(`Blocked navigation to external URL: ${url}`)
    }

    return { action: 'deny' }
  })

  return mainWindow
}

// IPC handlers for communication between renderer and main process
function setupIpcHandlers(mainWindow) {
  // Load saved configs and credentials
  ipcMain.handle('configLoad', () => {
    return store.store
  })

  // Handle getURL request to return current URL
  ipcMain.handle('getURL', () => {
    return store.get('url') || ''
  })

  // Save changes to config
  ipcMain.on('configSave', (event, config) => {
    // Merge incoming config changes with existing store
    const updatedConfig = { ...store.store, ...config }
    store.set(updatedConfig)

    // Only reload the URL if this is a navigation change (has URL and credentials)
    // and not just a UI preference update
    if (config.url && config.username && config.password) {
      mainWindow.loadURL(config.url)
    }
  })

  // Handle URL loading from renderer
  ipcMain.on('loadURL', (event, url) => {
    log(`Loading URL: ${url}`)
    mainWindow.loadURL(url)
  })

  // Handle application restart
  ipcMain.on('restart', (event) => {
    log('Restart requested')
    app.relaunch()
    app.exit()
  })

  // Handle reset request
  ipcMain.on('reset', (event) => {
    log('Reset requested')
    store.clear()
  })

  // Handle reset confirmation dialog
  ipcMain.handle('showResetConfirmation', async (event) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Reset Configuration',
      message: 'Are you sure you want to reset all settings?',
      detail: 'This will clear all your saved settings including credentials.',
      buttons: ['Cancel', 'Reset'],
      defaultId: 0,
      cancelId: 0,
    })

    return result.response === 1 // Return true if "Reset" was clicked
  })
}

// Wait until Electron app is ready
async function start() {
  await app.whenReady()
  await initializeStore()
  configureApp()

  const mainWindow = await createWindow()
  setupIpcHandlers(mainWindow)

  // Mac: Re-create window when dock icon is clicked and no windows are open
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// Start the app
start().catch((error) => {
  // Always log critical errors to console regardless of environment
  console.error('Error starting app:', error)
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
