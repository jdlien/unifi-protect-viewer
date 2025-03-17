// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
// electron-store is now an ESM module, use dynamic import
// const Store = require('electron-store')

// Initialize remote module for compatibility with existing code
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Constants
const DEFAULT_WIDTH = 1270
const DEFAULT_HEIGHT = 750
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'

// Store initialization
let store
const resetRequested = process.argv.includes('--reset')

// Initialize store
async function initializeStore() {
  const Store = (await import('electron-store')).default
  store = new Store()
  if (resetRequested) {
    store.clear()
  }
}

// Set up the load failure handler that can be reused
function setupLoadFailureHandler(window) {
  if (!window.webContents.listenerCount('did-fail-load')) {
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      // Show error page with option to return to config
      window.webContents
        .loadFile('./src/html/error-page.html', {
          query: {
            error: errorDescription,
            url: validatedURL,
          },
        })
        .catch(() => {
          // Fallback to config page if error page fails
          window.loadFile('./src/html/config.html')
        })
    })
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
    },
    icon: path.join(__dirname, '/src/img/128.png'),
    frame: true,
    autoHideMenuBar: true,
  })

  // Enable remote module for this window for backward compatibility
  remoteMain.enable(mainWindow.webContents)

  // Set custom user agent
  mainWindow.webContents.setUserAgent(USER_AGENT)

  // Handle certificate errors (self-signed certs)
  app.commandLine.appendSwitch('ignore-certificate-errors', 'true')

  // Set window title
  mainWindow.setTitle('UniFi Protect Viewer')

  // Disable automatic app title updates
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  // Save window bounds on close
  mainWindow.on('close', () => {
    store.set('bounds', mainWindow.getBounds())
  })

  // Set up error handling
  setupLoadFailureHandler(mainWindow)

  // Load the correct starting page
  await loadStartPage(mainWindow)
}

// Load the correct starting page based on configuration
async function loadStartPage(window) {
  // Check if we have a saved configuration
  const hasConfig = store.has('config') && store.get('config')?.url

  try {
    if (!hasConfig) {
      // No config - load config page
      await window.loadFile('./src/html/config.html')
    } else {
      // We have a config - try to load the URL directly
      const config = store.get('config')
      await window.loadURL(config.url)
    }
  } catch (error) {
    // Fall back to the config page
    await window.loadFile('./src/html/config.html')
  }
}

// Set up IPC handlers
function setupIPC() {
  // Configuration handlers
  ipcMain.handle('configLoad', () => store.get('config'))
  ipcMain.on('configSave', (event, config) => store.set('config', config))

  // App control handlers
  ipcMain.on('reset', () => store.clear())
  ipcMain.on('restart', () => {
    app.quit()
    app.relaunch()
  })

  // Add direct URL loading handler
  ipcMain.on('loadURL', (event, url) => {
    const mainWindow = BrowserWindow.getFocusedWindow()
    if (mainWindow) {
      setupLoadFailureHandler(mainWindow)
      mainWindow.loadURL(url)
    }
  })

  // Dialog handlers
  ipcMain.handle('showResetConfirmation', async () => {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', 'Reset'],
      defaultId: 0,
      title: 'Confirm Reset',
      message: 'Are you sure you want to reset the app settings?',
    })
    return result.response === 1 // Returns true if 'Reset' was clicked
  })
}

// App initialization
app.whenReady().then(async () => {
  // Choose one certificate handling approach - either this:
  /*
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // Allow all certificates - this is necessary for self-signed certs
    event.preventDefault()
    callback(true)
  })
  */
  // OR the app.commandLine.appendSwitch() in createWindow function, not both

  await initializeStore()
  setupIPC()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
