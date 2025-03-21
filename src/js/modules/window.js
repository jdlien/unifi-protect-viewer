/**
 * Window module to handle browser window creation and configuration
 */

const { BrowserWindow, app } = require('electron')
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

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
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

module.exports = {
  createWindow,
  handleCertificateError,
  setupWindowNavigation,
}
