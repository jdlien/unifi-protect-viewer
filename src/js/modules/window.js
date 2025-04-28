/**
 * Window module to handle browser window creation and configuration
 */

const { BrowserWindow, app, screen, shell, globalShortcut, ipcMain } = require('electron')
const path = require('node:path')
const utils = require('./utils')
const version = require('./version')
const { URL } = require('node:url')

// Constants
const DEFAULT_WIDTH = 1270
const DEFAULT_HEIGHT = 750

/**
 * Create the browser window.
 * @param {Object} store - The electron-store instance
 * @returns {BrowserWindow} The created browser window
 */
async function createWindow(store) {
  const mainWindow = new BrowserWindow({
    width: store.get('bounds')?.width || DEFAULT_WIDTH,
    height: store.get('bounds')?.height || DEFAULT_HEIGHT,
    x: store.get('bounds')?.x || undefined,
    y: store.get('bounds')?.y || undefined,
    webPreferences: {
      preload: path.join(__dirname, '../../js/preload.js'),
      contextIsolation: true, // Enable security
      nodeIntegration: false, // Disable direct access
      spellcheck: false,
      sandbox: false, // Needed for some functionality
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '../../img/128.png'),
    frame: true,
    autoHideMenuBar: true,
  })

  // Set custom user agent using dynamic values from version
  mainWindow.webContents.setUserAgent(version.userAgent)

  // Set window title
  mainWindow.setTitle(`UniFi Protect Viewer ${require('electron').app.getVersion()}`)

  // Open DevTools in development mode - with reliable detection
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    utils.log('Opening DevTools (development mode)')
    // Wait for window to be ready before opening DevTools
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        try {
          mainWindow.webContents.openDevTools({ mode: 'right' })
          utils.log('DevTools opened successfully')
        } catch (err) {
          utils.logError('Error opening DevTools:', err)
        }
      }, 1000) // Delay slightly to ensure window is fully loaded
    })
  }

  // Handle certificate errors - only bypass for configured domain
  mainWindow.webContents.on('certificate-error', handleCertificateError(store))

  // Save window position/size on close
  mainWindow.on('close', () => {
    store.set('bounds', mainWindow.getBounds())
  })

  // Load the initial URL
  const initialUrl = store.get('url') || 'about:blank'
  utils.log(`Loading initial URL: ${initialUrl}`)
  mainWindow.loadURL(initialUrl)

  // If no URL is set, navigate to the config page
  if (initialUrl === 'about:blank') {
    const configUrl = `file://${path.join(__dirname, '../../../src/html/config.html')}`
    mainWindow.loadURL(configUrl)
  }

  // Handle external links securely
  setupWindowNavigation(mainWindow, store)

  // Quit the app when the window is closed
  mainWindow.on('closed', () => app.quit())

  // Wait for window to be ready before setting up shortcuts
  mainWindow.once('ready-to-show', () => {
    // Register DevTools shortcut after window is ready
    registerDevToolsShortcut(mainWindow)
  })

  return mainWindow
}

/**
 * Handle certificate errors during navigation
 * @param {Object} store - The electron-store instance
 * @returns {Function} Event handler for certificate errors
 */
function handleCertificateError(store) {
  return (event, urlString, error, certificate, callback) => {
    const configUrl = store.get('url')
    const ignoreCertErrors = store.get('ignoreCertErrors') || false

    if (ignoreCertErrors && configUrl) {
      try {
        // Extract domains to compare
        const configDomain = new URL(configUrl).hostname
        const requestDomain = new URL(urlString).hostname

        // Only bypass for matching domains
        if (configDomain === requestDomain) {
          utils.log(`Bypassing certificate error for configured domain: ${requestDomain}`)
          event.preventDefault()
          callback(true) // Trust the certificate
          return
        }
      } catch (err) {
        utils.log('Error parsing URL when handling certificate error:', err)
      }
    }

    // Default: don't trust the certificate
    callback(false) // Don't trust the certificate
  }
}

/**
 * Set up window navigation handlers
 * @param {BrowserWindow} mainWindow - The main browser window
 * @param {Object} store - The electron-store instance
 */
function setupWindowNavigation(mainWindow, store) {
  // Handle external links securely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    utils.log(`Window open request for ${url}`)

    // Only allow navigation to URLs with expected protocols/domains
    // For the UniFi Protect application, we should only allow URLs related to the Protect system
    if (url.startsWith(store.get('url') || '') || url.startsWith('file://')) {
      mainWindow.loadURL(url)
    } else {
      utils.log(`Blocked navigation to external URL: ${url}`)
    }

    return { action: 'deny' }
  })

  // Handle page load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      // Ignore aborted loads (often just navigation)
      const errorPage = `file://${path.join(__dirname, '../../../src/html/error.html')}?error=${encodeURIComponent(errorDescription)}&url=${encodeURIComponent(validatedURL)}`
      mainWindow.loadURL(errorPage)
    }
  })
}

/**
 * Register the global shortcut for DevTools
 * @param {BrowserWindow} window - The browser window
 */
function registerDevToolsShortcut(window) {
  try {
    // First unregister in case it's already registered
    if (globalShortcut.isRegistered('F12')) {
      globalShortcut.unregister('F12')
    }

    // Register F12 to toggle DevTools globally
    globalShortcut.register('F12', () => {
      if (window && !window.isDestroyed()) {
        window.webContents.toggleDevTools()
        utils.log('DevTools toggled via F12 shortcut')
      }
    })

    utils.log('F12 shortcut registered for DevTools')
  } catch (err) {
    utils.logError('Error registering F12 shortcut:', err)
  }
}

/**
 * Release all global shortcuts and resources
 */
function cleanupResources() {
  utils.log('Cleaning up resources')

  // Unregister all shortcuts
  try {
    globalShortcut.unregisterAll()
  } catch (err) {
    utils.logError('Error unregistering shortcuts:', err)
  }
}

// Clean up resources when app is about to quit
app.on('will-quit', cleanupResources)

/**
 * Open DevTools directly
 * @param {BrowserWindow} window - The browser window
 * @param {Object} options - Options for opening DevTools
 */
function openDevTools(window, options = { mode: 'right' }) {
  if (window && !window.isDestroyed()) {
    try {
      window.webContents.openDevTools(options)
      return true
    } catch (err) {
      utils.logError('Error opening DevTools:', err)
      return false
    }
  }
  return false
}

module.exports = {
  createWindow,
  handleCertificateError,
  setupWindowNavigation,
  cleanupResources,
  registerDevToolsShortcut,
  openDevTools,
}
