/**
 * Updates module to handle auto-update UI notifications and main process functionality
 *
 * NOTE: This module is carefully structured to work in both main and renderer processes.
 * Main process exports are at the top, renderer process exports at the bottom.
 * The electron-updater module should only be imported in main process context.
 */

// Import utilities that work in both main and renderer
const utils = require('./utils')
const isDev = process.env.NODE_ENV === 'development'
const path = require('node:path')

// Get environment variable configurations with defaults
const disableAutoUpdates = process.env.DISABLE_AUTO_UPDATES === 'true'
const updateCheckInterval = parseInt(process.env.UPDATE_CHECK_INTERVAL || '21600000', 10) // Default: 6 hours
const initialUpdateDelay = parseInt(process.env.INITIAL_UPDATE_DELAY || '10000', 10) // Default: 10 seconds

// MAIN PROCESS CODE
// These functions are only used in the main process
let autoUpdater, dialog, app, ipcMain, BrowserWindow

/**
 * Handle GitHub authentication error messages
 * @param {string} errorMessage - The error message to check
 * @returns {string} Formatted GitHub error message or original message
 */
function getGitHubErrorMessage(errorMessage) {
  if (
    errorMessage.includes('API rate limit exceeded') ||
    errorMessage.includes('Not Found') ||
    errorMessage.includes('Bad credentials') ||
    errorMessage.includes('Unauthorized')
  ) {
    return (
      'GitHub authentication error detected.\n\n' +
      'To enable updates, you need to set up a GitHub Personal Access Token (PAT):\n\n' +
      '1. Create a PAT at https://github.com/settings/tokens with "repo" scope\n' +
      '2. Set the token as GH_TOKEN environment variable\n' +
      '3. Or add it to your .env file: GH_TOKEN=your_token\n\n' +
      'Then restart the application to enable updates.'
    )
  }
  return errorMessage
}

// Lazy-load electron-updater in main process only
function getAutoUpdater() {
  if (!autoUpdater) {
    try {
      // Only load these modules in main process context
      autoUpdater = require('electron-updater').autoUpdater
      dialog = require('electron').dialog
      app = require('electron').app
      ipcMain = require('electron').ipcMain
      BrowserWindow = require('electron').BrowserWindow

      // Setup logger
      if (autoUpdater && !autoUpdater.logger) {
        autoUpdater.logger = utils.logger
      }

      // Force updates in development mode (for testing only)
      if (isDev && process.env.FORCE_DEV_UPDATES === 'true') {
        utils.log('Forcing updates in development mode for testing')
        autoUpdater.forceDevUpdateConfig = true
        autoUpdater.allowPrerelease = true
      }

      // Validate autoUpdater instance
      if (!autoUpdater || typeof autoUpdater.checkForUpdates !== 'function') {
        throw new Error('Invalid autoUpdater instance - missing methods')
      }
    } catch (err) {
      utils.logError('Failed to load auto-updater:', err)

      // Create a simple dummy auto-updater with required methods
      return createDummyAutoUpdater()
    }
  }
  return autoUpdater
}

/**
 * Create a dummy auto-updater for when the real one can't be loaded
 * @returns {Object} A dummy auto-updater with required methods
 */
function createDummyAutoUpdater() {
  const dummyEventEmitter = {
    _events: {},
    on: function (event, listener) {
      if (!this._events[event]) this._events[event] = []
      this._events[event].push(listener)
      return this
    },
    once: function (event, listener) {
      const onceWrapper = (...args) => {
        this.removeListener(event, onceWrapper)
        listener.apply(this, args)
      }
      this.on(event, onceWrapper)
      return this
    },
    removeListener: function (event, listener) {
      if (this._events[event]) {
        this._events[event] = this._events[event].filter((l) => l !== listener)
      }
      return this
    },
    emit: function (event, ...args) {
      if (this._events[event]) {
        this._events[event].forEach((listener) => listener(...args))
      }
      return true
    },
  }

  // Return a dummy auto-updater to prevent crashes
  return Object.assign(dummyEventEmitter, {
    logger: utils.logger,
    autoDownload: false,
    checkForUpdates: () => {
      utils.log('[Dummy] Check for updates called')
      setTimeout(() => dummyEventEmitter.emit('update-not-available'), 500)
      return Promise.resolve()
    },
    downloadUpdate: () => {
      utils.log('[Dummy] Download update called')
      return Promise.resolve()
    },
    quitAndInstall: () => {
      utils.log('[Dummy] Quit and install called')
    },
  })
}

/**
 * Configure auto-updater for the main process
 * @param {BrowserWindow} mainWindow - The main application window
 */
function setupAutoUpdater(mainWindow) {
  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) return

  // Disable auto download
  autoUpdater.autoDownload = false

  // Configure logging
  autoUpdater.logger = utils.logger

  // Handle update events
  autoUpdater.on('checking-for-update', () => {
    utils.log('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    utils.log('Update available:', info.version)
    mainWindow.webContents.send('update-available', info)

    // Ask user if they want to download the update
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available.`,
        detail: 'Would you like to download it now?',
        buttons: ['Download', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
  })

  autoUpdater.on('update-not-available', () => {
    utils.log('No updates available')
  })

  autoUpdater.on('error', (err) => {
    utils.logError('Update error:', err)
    const errorMessage = err.message || String(err)
    mainWindow.webContents.send(
      'update-error',
      errorMessage.includes('API rate limit') ||
        errorMessage.includes('credentials') ||
        errorMessage.includes('Unauthorized')
        ? 'GitHub authentication error. A Personal Access Token may be required.'
        : errorMessage,
    )
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    utils.log('Update downloaded')
    mainWindow.webContents.send('update-downloaded', info)

    // Prompt user to install update
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded',
        detail: 'A new version has been downloaded. Restart the application to apply the update.',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(true, true)
        }
      })
  })

  // Check for updates (but not in dev mode)
  if (!isDev) {
    if (disableAutoUpdates) {
      utils.log('Auto-updates disabled via configuration')
      return
    }

    // Schedule update checks
    setTimeout(() => {
      utils.log('Initial update check')
      autoUpdater.checkForUpdates().catch((err) => utils.logError('Update check error:', err))
    }, initialUpdateDelay)

    setInterval(() => {
      utils.log('Scheduled update check')
      autoUpdater.checkForUpdates().catch((err) => utils.logError('Update check error:', err))
    }, updateCheckInterval)
  } else {
    utils.log('Auto-updates disabled in development mode')
  }
}

/**
 * Register IPC handlers for update-related events
 * @param {BrowserWindow} mainWindow - The main application window
 */
function setupUpdateIpcHandlers(mainWindow) {
  if (!ipcMain) {
    ipcMain = require('electron').ipcMain
  }

  if (!app) {
    app = require('electron').app
  }

  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) return

  // Update-related IPC handlers
  ipcMain.on('check-for-updates', () => {
    if (isDev && !process.env.FORCE_DEV_UPDATES) {
      utils.log('Update check requested in dev mode - skipping')
      return
    }
    utils.log('Manual update check requested')
    autoUpdater.checkForUpdates().catch((err) => utils.logError('Error checking for updates:', err))
  })

  ipcMain.on('download-update', () => {
    utils.log('Manual update download requested')
    autoUpdater.downloadUpdate().catch((err) => utils.logError('Error downloading update:', err))
  })

  ipcMain.on('install-update', () => {
    utils.log('Manual update installation requested')
    autoUpdater.quitAndInstall(true, true)
  })

  // Get app version (sync)
  ipcMain.on('get-app-version', (event) => {
    event.returnValue = app.getVersion()
  })
}

/**
 * Initialize update functionality - main process entry point
 * @param {BrowserWindow} mainWindow - The main application window
 */
function initialize(mainWindow) {
  setupAutoUpdater(mainWindow)
  setupUpdateIpcHandlers(mainWindow)
}

/**
 * Check for updates and show results in a dialog
 * @param {BrowserWindow} mainWindow - The main browser window
 */
function checkForUpdatesWithDialog(mainWindow) {
  try {
    utils.log('Manually checking for updates from dialog')
    const autoUpdater = getAutoUpdater()

    // Make sure BrowserWindow is available
    if (!BrowserWindow) {
      BrowserWindow = require('electron').BrowserWindow
    }

    // Override for testing in development mode
    if (isDev && !process.env.FORCE_DEV_UPDATES) {
      utils.log('Development mode detected, but proceeding with update check for testing')
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.allowPrerelease = true
    }

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

    // Show checking dialog
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
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    checkingDialog.loadFile(path.join(__dirname, '../../html/update-checking.html'))
    checkingDialog.once('ready-to-show', () => checkingDialog.show())

    // Helper to close the checking dialog
    const closeCheckingDialog = () => {
      if (checkingDialog && !checkingDialog.isDestroyed()) {
        checkingDialog.close()
        checkingDialog = null
      }
    }

    // Set up event handlers for update checking
    const updateAvailableHandler = (info) => {
      closeCheckingDialog()

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
            // Create download progress dialog
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
                preload: path.join(__dirname, '../../js/download-preload.js'),
              },
            })

            downloadDialog.loadFile(path.join(__dirname, '../../html/update-downloading.html'))
            downloadDialog.once('ready-to-show', () => downloadDialog.show())

            // Progress and completion handlers
            const downloadProgressHandler = (progressObj) => {
              if (downloadDialog && !downloadDialog.isDestroyed()) {
                downloadDialog.webContents.send('update-progress', progressObj)
              }
            }

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
                    autoUpdater.quitAndInstall()
                  }
                })
            }

            // Register event handlers
            autoUpdater.on('download-progress', downloadProgressHandler)
            autoUpdater.once('update-downloaded', downloadCompletedHandler)

            // Handle download errors
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
      closeCheckingDialog()

      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates',
        message: 'You have the latest version',
        detail: `Version ${app.getVersion()} is the latest version available.`,
        buttons: ['OK'],
      })
    }

    const updateErrorHandler = (err) => {
      closeCheckingDialog()

      utils.logError('Error checking for updates:', err)
      const errorMessage = err.message || String(err)

      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Error',
        message: 'Error Checking for Updates',
        detail: getGitHubErrorMessage(errorMessage),
        buttons: ['OK'],
      })
    }

    // Register temporary event listeners
    autoUpdater.once('update-available', updateAvailableHandler)
    autoUpdater.once('update-not-available', updateNotAvailableHandler)
    autoUpdater.once('error', updateErrorHandler)

    // Start update check
    autoUpdater.checkForUpdates().catch(updateErrorHandler)

    // Set a timeout to close the checking dialog if no response is received
    setTimeout(() => {
      if (checkingDialog && !checkingDialog.isDestroyed()) {
        closeCheckingDialog()

        // Remove event listeners
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
    }, 30000) // 30 second timeout
  } catch (err) {
    utils.logError('Error initiating update check:', err)
    const errorMessage = err.message || String(err)

    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Error',
      message: 'Error Checking for Updates',
      detail: errorMessage.includes('GitHub')
        ? 'GitHub authentication error. Please check your GH_TOKEN environment variable.'
        : `An unexpected error occurred: ${errorMessage}`,
      buttons: ['OK'],
    })
  }
}

// RENDERER PROCESS CODE
// These functions are only used in the renderer process

/**
 * Initialize update listeners in the renderer process
 */
function initializeUpdateListeners() {
  if (typeof window === 'undefined' || !window.electronAPI?.updates) {
    utils.log('Update API not available')
    return
  }

  utils.log('Initializing update listeners')

  // Handle update available notification
  window.electronAPI.updates.onUpdateAvailable((info) => {
    utils.log('Update available:', info.version)
    showUpdateNotification(
      `Update Available: v${info.version}`,
      'A new version is available. Click to download.',
      () => {
        window.electronAPI.updates.downloadUpdate()
      },
    )
  })

  // Handle update errors
  window.electronAPI.updates.onUpdateError((message) => {
    utils.logError('Update error:', message)
  })

  // Handle download progress
  window.electronAPI.updates.onDownloadProgress((progress) => {
    updateDownloadProgress(Math.floor(progress.percent))
  })

  // Handle update downloaded
  window.electronAPI.updates.onUpdateDownloaded((info) => {
    utils.log('Update downloaded:', info.version)
    showUpdateNotification(`Update Ready: v${info.version}`, 'Update downloaded. Click to install and restart.', () => {
      window.electronAPI.updates.installUpdate()
    })
  })
}

/**
 * Show an update notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Function} onClick - Click handler
 */
function showUpdateNotification(title, message, onClick) {
  if (typeof document === 'undefined') return

  // Remove any existing notification
  removeUpdateNotification()

  // Create notification element
  const notification = document.createElement('div')
  notification.id = 'update-notification'
  notification.className = 'update-notification'
  notification.innerHTML = `
    <div class="update-notification-content">
      <h3>${title}</h3>
      <p>${message}</p>
      <div id="update-progress" class="update-progress" style="display: none;">
        <div id="update-progress-bar" class="update-progress-bar"></div>
        <div id="update-progress-text" class="update-progress-text">0%</div>
      </div>
    </div>
  `

  // Add click handler
  notification.addEventListener('click', onClick)

  // Add close button
  const closeButton = document.createElement('button')
  closeButton.className = 'update-notification-close'
  closeButton.innerHTML = '×'
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation() // Prevent notification click
    removeUpdateNotification()
  })
  notification.appendChild(closeButton)

  // Add to DOM
  document.body.appendChild(notification)

  // Add styles if not already added
  addUpdateStyles()
}

/**
 * Update the download progress bar
 * @param {number} percent - Download percentage
 */
function updateDownloadProgress(percent) {
  if (typeof document === 'undefined') return

  const progressBar = document.getElementById('update-progress-bar')
  const progressText = document.getElementById('update-progress-text')
  const progressContainer = document.getElementById('update-progress')

  if (progressContainer && progressBar && progressText) {
    progressContainer.style.display = 'block'
    progressBar.style.width = `${percent}%`
    progressText.textContent = `${percent}%`
  }
}

/**
 * Remove update notification
 */
function removeUpdateNotification() {
  if (typeof document === 'undefined') return

  const notification = document.getElementById('update-notification')
  if (notification) {
    notification.remove()
  }
}

/**
 * Add update notification styles to the document
 */
function addUpdateStyles() {
  if (typeof document === 'undefined') return

  if (document.getElementById('update-notification-styles')) return

  const style = document.createElement('style')
  style.id = 'update-notification-styles'
  style.textContent = `
    .update-notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #2a2a2a;
      color: #f0f0f0;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 9999;
      max-width: 350px;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 1px solid #3a3a3a;
    }

    .update-notification:hover {
      background-color: #323232;
      transform: translateY(-3px);
    }

    .update-notification-content h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .update-notification-content p {
      margin: 0 0 10px 0;
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.4;
    }

    .update-notification-close {
      position: absolute;
      top: 8px;
      right: 10px;
      background: none;
      border: none;
      color: #a0a0a0;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }

    .update-notification-close:hover {
      color: #f0f0f0;
    }

    .update-progress {
      height: 6px;
      background: #444;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 10px;
      position: relative;
    }

    .update-progress-bar {
      height: 100%;
      background: #4c9eff;
      transition: width 0.3s ease;
      width: 0%;
    }

    .update-progress-text {
      position: absolute;
      right: 0;
      top: -18px;
      font-size: 12px;
      opacity: 0.8;
    }
  `

  document.head.appendChild(style)
}

/**
 * Check for updates manually
 */
function checkForUpdates() {
  if (typeof window !== 'undefined' && window.electronAPI?.updates) {
    window.electronAPI.updates.checkForUpdates()
  }
}

module.exports = {
  // Main process exports
  initialize,
  setupAutoUpdater,
  setupUpdateIpcHandlers,
  getAutoUpdater,

  // Renderer process exports
  initializeUpdateListeners,
  showUpdateNotification,
  removeUpdateNotification,
  checkForUpdates,
  checkForUpdatesWithDialog,
}
