// Modules to control application life and create native browser window
// Load environment variables from .env file
try {
  require('dotenv').config()
  if (process.env.GH_TOKEN) {
    console.log('GitHub token found in environment variables')
  }
} catch (err) {
  console.error('Error loading .env file:', err)
}

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const version = require('./src/js/modules/version')
const { URL } = require('node:url')
const utils = require('./src/js/modules/utils')
const updates = require('./src/js/modules/updates')

// Constants
const DEFAULT_WIDTH = 1270
const DEFAULT_HEIGHT = 750
const isDev = process.env.NODE_ENV === 'development'

// Enable hot reloading in development mode
if (isDev) {
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

// Configure any custom app behavior
function configureApp() {
  // Disable hardware acceleration if requested by config
  if (store.get('disableHardwareAcceleration')) {
    app.disableHardwareAcceleration()
    utils.log('Hardware acceleration disabled')
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

  // Set custom user agent using dynamic values from version
  mainWindow.webContents.setUserAgent(version.userAgent)

  // Set window title
  mainWindow.setTitle(`UniFi Protect Viewer ${app.getVersion()}`)

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  // Handle certificate errors - only bypass for configured domain
  mainWindow.webContents.on('certificate-error', (event, urlString, error, certificate, callback) => {
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
  })

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
    const configUrl = `file://${path.join(__dirname, 'src/html/config.html')}`
    mainWindow.loadURL(configUrl)
  }

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

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      // Ignore aborted loads (often just navigation)
      const errorPage = `file://${path.join(__dirname, 'src/html/error.html')}?error=${encodeURIComponent(errorDescription)}&url=${encodeURIComponent(validatedURL)}`
      mainWindow.loadURL(errorPage)
    }
  })

  return mainWindow
}

// IPC handlers for communication between renderer and main process
function setupIpcHandlers(mainWindow) {
  // Load saved configs and credentials
  ipcMain.handle('configLoad', () => {
    return store.store
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

  // Handle partial config updates (for things like login attempts)
  ipcMain.handle('configSavePartial', (event, partialConfig) => {
    // Update only the specified config values
    Object.entries(partialConfig).forEach(([key, value]) => {
      store.set(key, value)
    })
    return true
  })

  // Handle URL loading from renderer
  ipcMain.on('loadURL', (event, url) => {
    utils.log(`Loading URL: ${url}`)
    mainWindow.loadURL(url)
  })

  // Handle application restart
  ipcMain.on('restart', (event) => {
    utils.log('Restart requested')
    app.relaunch()
    app.exit()
  })

  // Handle reset request
  ipcMain.on('reset', (event) => {
    utils.log('Reset requested')
    store.clear()
  })

  // Handle fullscreen toggle
  ipcMain.on('toggleFullscreen', (event) => {
    utils.log('Fullscreen toggle requested')
    if (mainWindow) {
      const isFullScreen = mainWindow.isFullScreen()
      mainWindow.setFullScreen(!isFullScreen)
    }
  })

  // Handle menu state updates from renderer
  ipcMain.on('update-dashboard-state', (event, isDashboardPage) => {
    const viewMenu = mainMenu?.items.find((item) => item.label === 'View')
    if (viewMenu && viewMenu.submenu) {
      const dashboardItem = viewMenu.submenu.items.find((item) => item.label === 'Return to Dashboard')
      if (dashboardItem) {
        dashboardItem.enabled = !isDashboardPage
      }
    }
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

let mainMenu // Declare at the top level to access it later

// Setup application menu
function setupApplicationMenu(mainWindow) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'About UniFi Protect Viewer',
          click: () => {
            showAboutDialog(mainWindow)
          },
        },
        {
          label: 'Check for Updates',
          click: () => {
            checkForUpdatesWithDialog(mainWindow)
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen', accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : null },
        {
          label: 'Toggle Fullscreen (F11)',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen())
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Navigation',
          accelerator: 'Escape',
          click: () => {
            mainWindow.webContents.send('toggle-navigation')
          },
        },
        { type: 'separator' },
        {
          label: 'Return to Dashboard',
          accelerator: 'Home',
          click: () => {
            mainWindow.webContents.send('return-to-dashboard')
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            checkForUpdatesWithDialog(mainWindow)
          },
        },
        {
          label: 'View on GitHub',
          click: () => {
            shell.openExternal('https://github.com/jdlien/unifi-protect-viewer')
          },
        },
      ],
    },
  ]

  mainMenu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(mainMenu)

  // Set up a listener for navigation events to update menu
  mainWindow.webContents.on('did-navigate', () => {
    updateMenuState(mainWindow)
  })

  // Also update on page load completion for SPAs
  mainWindow.webContents.on('did-finish-load', () => {
    updateMenuState(mainWindow)
  })

  // Initial menu state update
  updateMenuState(mainWindow)
}

// Update menu items based on current page
function updateMenuState(mainWindow) {
  // Check if we're on a dashboard page
  mainWindow.webContents
    .executeJavaScript(
      `
    // Use the dashboard module to check if we're on a dashboard page
    window.location.href.includes('/protect/dashboard')
  `,
    )
    .then((isDashboardPage) => {
      // Find the Return to Dashboard menu item
      const viewMenu = mainMenu.items.find((item) => item.label === 'View')
      if (viewMenu && viewMenu.submenu) {
        const dashboardItem = viewMenu.submenu.items.find((item) => item.label === 'Return to Dashboard')
        if (dashboardItem) {
          dashboardItem.enabled = !isDashboardPage
        }
      }
    })
    .catch((error) => {
      utils.logError('Error updating menu state:', error)
    })
}

// Show native About dialog
function showAboutDialog(mainWindow) {
  const appVersion = app.getVersion()

  dialog
    .showMessageBox(mainWindow, {
      title: 'About UniFi Protect Viewer',
      message: 'UniFi Protect Viewer',
      detail: `Version ${appVersion}\n\nA clean, standalone viewer for UniFi Protect cameras.\nDeveloped by JD Lien.`,
      buttons: ['Check for Updates', 'View on GitHub', 'Close'],
      defaultId: 2,
      cancelId: 2,
      noLink: true,
      icon: path.join(__dirname, '/src/img/128.png'),
    })
    .then(({ response }) => {
      if (response === 0) {
        // Check for updates
        checkForUpdatesWithDialog(mainWindow)
      } else if (response === 1) {
        // View on GitHub
        shell.openExternal('https://github.com/jdlien/unifi-protect-viewer')
      }
    })
    .catch((err) => {
      utils.logError('Error showing About dialog:', err)
    })
}

// Check for updates and show results in a dialog
function checkForUpdatesWithDialog(mainWindow) {
  try {
    utils.log('Manually checking for updates from dialog')

    // Get the auto-updater instance
    const autoUpdater = updates.getAutoUpdater()

    // If the auto-updater is not available, show a message and return
    if (!autoUpdater) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Updates',
        message: 'Update System Not Available',
        detail: isDev
          ? 'Updates are disabled in development mode. Set FORCE_DEV_UPDATES=true in your .env file to test updates.'
          : 'The update system is not available due to initialization errors.',
        buttons: ['OK'],
      })
      return
    }

    // Verify that autoUpdater has the expected methods
    if (typeof autoUpdater.checkForUpdates !== 'function') {
      utils.logError('Invalid autoUpdater instance - missing methods')
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Error',
        message: 'Update System Error',
        detail: 'Could not initialize the update system properly. Some functionality might be missing.',
        buttons: ['OK'],
      })
      return
    }

    // Show initial checking dialog
    let checkingDialog = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      show: false,
      width: 350,
      height: 140,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Checking for Updates',
      vibrancy: 'under-window', // MacOS vibrancy effect
      visualEffectState: 'active', // For macOS
      backgroundColor: '#00000000', // Transparent background for proper theme support
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Use our HTML file for the checking dialog
    checkingDialog.loadFile(path.join(__dirname, 'src/html/update-checking.html'))

    checkingDialog.once('ready-to-show', () => {
      checkingDialog.show()
    })

    // Set up event handlers for update checking
    const updateAvailableHandler = (info) => {
      if (checkingDialog && !checkingDialog.isDestroyed()) {
        checkingDialog.close()
        checkingDialog = null
      }

      // Show update available dialog
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Available',
          message: `Version ${info.version} Available`,
          detail: 'A new version is available. Would you like to download it now?',
          buttons: ['Download', 'Later'],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) {
            // Create a download progress dialog
            let downloadDialog = new BrowserWindow({
              parent: mainWindow,
              modal: true,
              show: false,
              width: 400,
              height: 170,
              resizable: false,
              minimizable: false,
              maximizable: false,
              fullscreenable: false,
              title: 'Downloading Update',
              vibrancy: 'under-window',
              visualEffectState: 'active',
              backgroundColor: '#00000000',
              webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: path.join(__dirname, 'src/js/download-preload.js'),
              },
            })

            // Load the file
            downloadDialog.loadFile(path.join(__dirname, 'src/html/update-downloading.html'))

            downloadDialog.once('ready-to-show', () => {
              downloadDialog.show()
            })

            // Set up download progress handler
            const downloadProgressHandler = (progressObj) => {
              if (downloadDialog && !downloadDialog.isDestroyed()) {
                downloadDialog.webContents.send('update-progress', progressObj)
              }
            }

            // Set up download completion handler
            const downloadCompletedHandler = () => {
              if (downloadDialog && !downloadDialog.isDestroyed()) {
                downloadDialog.close()
                downloadDialog = null
              }

              dialog
                .showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Update Ready',
                  message: 'Update Downloaded',
                  detail: 'The update has been downloaded. It will be installed when you restart the application.',
                  buttons: ['Restart Now', 'Later'],
                  defaultId: 0,
                })
                .then(({ response }) => {
                  if (response === 0) {
                    // Quit and install
                    autoUpdater.quitAndInstall()
                  }
                })
            }

            // Register event handlers
            autoUpdater.on('download-progress', downloadProgressHandler)
            autoUpdater.once('update-downloaded', downloadCompletedHandler)

            // Start the download
            autoUpdater.downloadUpdate().catch((err) => {
              if (downloadDialog && !downloadDialog.isDestroyed()) {
                downloadDialog.close()
                downloadDialog = null
              }

              utils.logError('Error downloading update:', err)
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Download Error',
                message: 'Error Downloading Update',
                detail: `Unable to download the update: ${err.message || err}`,
                buttons: ['OK'],
              })

              // Clean up event listeners
              autoUpdater.removeListener('download-progress', downloadProgressHandler)
              autoUpdater.removeListener('update-downloaded', downloadCompletedHandler)
            })
          }
        })
    }

    const updateNotAvailableHandler = () => {
      if (checkingDialog && !checkingDialog.isDestroyed()) {
        checkingDialog.close()
        checkingDialog = null
      }

      // Show no updates dialog
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates',
        message: 'You have the latest version',
        detail: `Version ${app.getVersion()} is the latest version available.`,
        buttons: ['OK'],
      })
    }

    const updateErrorHandler = (err) => {
      if (checkingDialog && !checkingDialog.isDestroyed()) {
        checkingDialog.close()
        checkingDialog = null
      }

      utils.logError('Error checking for updates:', err)

      // Check for GitHub authentication errors
      const errorMessage = err.message || String(err)
      let detailMessage = `Unable to check for updates: ${errorMessage}`

      if (
        errorMessage.includes('API rate limit exceeded') ||
        errorMessage.includes('Not Found') ||
        errorMessage.includes('Bad credentials') ||
        errorMessage.includes('Unauthorized')
      ) {
        detailMessage =
          'GitHub authentication error detected.\n\n' +
          'To enable updates, you need to set up a GitHub Personal Access Token (PAT):\n\n' +
          '1. Create a PAT at https://github.com/settings/tokens with "repo" scope\n' +
          '2. Set the token as GH_TOKEN environment variable\n' +
          '3. Or add it to your .env file: GH_TOKEN=your_token\n\n' +
          'Also verify releases exist at: https://github.com/jdlien/unifi-protect-viewer/releases\n\n' +
          'Then restart the application to enable updates.'
      }

      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Error',
        message: 'Error Checking for Updates',
        detail: detailMessage,
        buttons: ['OK'],
      })
    }

    // Register temporary event listeners
    autoUpdater.once('update-available', updateAvailableHandler)
    autoUpdater.once('update-not-available', updateNotAvailableHandler)
    autoUpdater.once('error', updateErrorHandler)

    // Log that we're about to check for updates
    utils.log(`Starting update check with forceDevUpdateConfig=${autoUpdater.forceDevUpdateConfig}`)

    // Perform the update check
    autoUpdater
      .checkForUpdates()
      .then((result) => {
        // Log the result object to see what's happening
        utils.log(
          'Update check initial result:',
          result
            ? {
                updateInfo: result.updateInfo
                  ? {
                      version: result.updateInfo.version,
                      files: result.updateInfo.files,
                      path: result.updateInfo.path,
                    }
                  : 'none',
              }
            : 'no result',
        )
      })
      .catch((err) => {
        // Handle errors that don't go through the event system
        utils.logError('Direct update check error:', err)
        updateErrorHandler(err)
      })

    // Set a timeout to close the checking dialog if no response is received
    setTimeout(() => {
      if (checkingDialog && !checkingDialog.isDestroyed()) {
        checkingDialog.close()
        checkingDialog = null

        // Remove the event listeners if the timeout is triggered
        autoUpdater.removeListener('update-available', updateAvailableHandler)
        autoUpdater.removeListener('update-not-available', updateNotAvailableHandler)
        autoUpdater.removeListener('error', updateErrorHandler)

        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Update Check Timeout',
          message: 'Update Check Timed Out',
          detail: 'Unable to check for updates. Please check your internet connection and try again.',
          buttons: ['OK'],
        })
      }
    }, 60000) // 60 second timeout
  } catch (err) {
    utils.logError('Error initiating update check:', err)

    // Check for GitHub authentication errors
    const errorMessage = err.message || String(err)
    let detailMessage = `An unexpected error occurred: ${errorMessage}`

    if (
      errorMessage.includes('API rate limit exceeded') ||
      errorMessage.includes('Not Found') ||
      errorMessage.includes('Bad credentials') ||
      errorMessage.includes('Unauthorized')
    ) {
      detailMessage =
        'GitHub authentication error detected.\n\n' +
        'To enable updates, you need to set up a GitHub Personal Access Token (PAT):\n\n' +
        '1. Create a PAT at https://github.com/settings/tokens with "repo" scope\n' +
        '2. Set the token as GH_TOKEN environment variable\n' +
        '3. Or add it to your .env file: GH_TOKEN=your_token\n\n' +
        'Also verify releases exist at: https://github.com/jdlien/unifi-protect-viewer/releases\n\n' +
        'Then restart the application to enable updates.'
    }

    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Error',
      message: 'Error Checking for Updates',
      detail: detailMessage,
      buttons: ['OK'],
    })
  }
}

// Wait until Electron app is ready
async function start() {
  await app.whenReady()
  await initializeStore()
  configureApp()

  const mainWindow = await createWindow()
  setupIpcHandlers(mainWindow)

  // Initialize update system with error handling
  try {
    utils.log('Initializing auto-update system...')
    updates.initialize(mainWindow)
    utils.log('Auto-update system initialized successfully')
  } catch (error) {
    utils.logError('Error initializing auto-update system:', error)
  }

  // Set up application menu
  setupApplicationMenu(mainWindow)

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
