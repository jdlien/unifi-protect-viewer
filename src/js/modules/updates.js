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
let _mainWindow // Store mainWindow reference for internal use
let isManualCheckInProgress = false // Flag to track manual checks
let checkingDialog = null // Reference to the checking dialog window
let downloadDialog = null // Reference to the download dialog window

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
 * Close the 'Checking for Updates' modal window
 */
function _closeCheckingDialog() {
  if (checkingDialog && !checkingDialog.isDestroyed()) {
    checkingDialog.close()
  }
  checkingDialog = null
}

/**
 * Close the 'Downloading Update' modal window
 */
function _closeDownloadDialog() {
  if (downloadDialog && !downloadDialog.isDestroyed()) {
    downloadDialog.close()
  }
  downloadDialog = null
}

/**
 * Manages the UI flow for update checking, downloading, and installation.
 * This is the central function for handling update-related dialogs and windows.
 * @param {string} step - The current step ('check', 'available', 'downloading', 'downloaded', 'error', 'not-available')
 * @param {object} [data] - Optional data associated with the step (e.g., info, progress, error)
 */
async function _manageUpdateUI(step, data) {
  if (!_mainWindow || _mainWindow.isDestroyed()) {
    utils.logError('Update UI cannot be shown: main window is not available.')
    return
  }

  const autoUpdaterInstance = getAutoUpdater() // Ensure we have the instance

  switch (step) {
    case 'check':
      // Close any existing dialogs first
      _closeCheckingDialog()
      _closeDownloadDialog()

      isManualCheckInProgress = true // Mark that a manual check started the UI flow
      utils.log('Showing checking for updates window.')

      checkingDialog = new BrowserWindow({
        parent: _mainWindow,
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
        backgroundColor: '#00000000', // Transparent background
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      checkingDialog.loadFile(path.join(__dirname, '../../html/update-checking.html'))
      checkingDialog.once('ready-to-show', () => checkingDialog.show())
      checkingDialog.on('closed', () => {
        checkingDialog = null
      })

      // Start the actual check
      try {
        await autoUpdaterInstance.checkForUpdates()
      } catch (err) {
        // Error during check initiation might be caught by the 'error' event listener
        // Or could be a setup issue before listeners are attached
        utils.logError('Error initiating update check:', err)
        _manageUpdateUI('error', { error: err }) // Show error UI immediately
      }
      break

    case 'available':
      _closeCheckingDialog() // Close checking dialog if open
      const { info } = data // UpdateInfo object

      utils.log(`Showing update available dialog for version ${info.version}`)
      const { response: downloadResponse } = await dialog.showMessageBox(_mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} Available`,
        detail: 'A new version is available. Would you like to download it now?',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })

      if (downloadResponse === 0) {
        // Download
        _manageUpdateUI('downloading') // Transition to downloading state
        try {
          await autoUpdaterInstance.downloadUpdate()
        } catch (err) {
          utils.logError('Error starting update download:', err)
          _manageUpdateUI('error', err)
        }
      } else {
        isManualCheckInProgress = false // Reset flag if user cancels
      }
      break

    case 'downloading':
      _closeCheckingDialog() // Ensure checking dialog is closed
      _closeDownloadDialog() // Close previous download dialog if any

      utils.log('Showing downloading update window.')
      downloadDialog = new BrowserWindow({
        parent: _mainWindow,
        modal: true,
        show: false,
        width: 400,
        height: 200, // Increased height for status text
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        title: 'Downloading Update',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000', // Transparent background
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(__dirname, '../../js/download-preload.js'),
        },
      })
      downloadDialog.loadFile(path.join(__dirname, '../../html/update-downloading.html'))
      downloadDialog.once('ready-to-show', () => downloadDialog.show())
      downloadDialog.on('closed', () => {
        downloadDialog = null
      })
      break

    case 'progress':
      // Send progress to the download window if it exists
      if (downloadDialog && !downloadDialog.isDestroyed()) {
        downloadDialog.webContents.send('update-progress', data.progress)
      }
      // Also send to main window for potential renderer UI (like toast)
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('download-progress', data.progress)
      }
      break

    case 'downloaded':
      _closeDownloadDialog() // Close download dialog
      const { downloadedInfo } = data // UpdateInfo object

      utils.log(`Showing update downloaded dialog for version ${downloadedInfo.version}`)
      const { response: restartResponse } = await dialog.showMessageBox(_mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Update Downloaded (v${downloadedInfo.version})`,
        detail: 'The update has been downloaded. Restart the application to apply the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })

      isManualCheckInProgress = false // Reset flag after download completes

      if (restartResponse === 0) {
        // Restart
        autoUpdaterInstance.quitAndInstall(true, true) // isSilent = true, isForceRunAfter = true
      }
      break

    case 'not-available':
      _closeCheckingDialog()
      // Only show 'no update' dialog if a manual check triggered the process
      if (isManualCheckInProgress) {
        utils.log('Showing no updates available dialog.')
        dialog.showMessageBox(_mainWindow, {
          type: 'info',
          title: 'No Updates',
          message: 'You have the latest version',
          detail: `Version ${app.getVersion()} is the latest version available.`,
          buttons: ['OK'],
        })
      } else {
        utils.log('No updates available (automatic check).')
      }
      isManualCheckInProgress = false // Reset flag
      break

    case 'error':
      _closeCheckingDialog()
      _closeDownloadDialog()
      isManualCheckInProgress = false // Reset flag on error

      const error = data.error || new Error('Unknown update error')
      const errorMessage = error.message || String(error)
      utils.logError('Update error occurred:', errorMessage)

      dialog.showMessageBox(_mainWindow, {
        type: 'error',
        title: 'Update Error',
        message: 'Error During Update Process',
        detail: getGitHubErrorMessage(errorMessage), // Format GitHub errors nicely
        buttons: ['OK'],
      })
      break

    default:
      utils.logWarn(`_manageUpdateUI called with unknown step: ${step}`)
  }
}

/**
 * Configure auto-updater for the main process
 * @param {BrowserWindow} mainWindow - The main application window
 */
function setupAutoUpdater(mainWindow) {
  _mainWindow = mainWindow // Store reference for internal use
  const autoUpdaterInstance = getAutoUpdater()
  if (!autoUpdaterInstance) return

  // Disable auto download - we manage it via _manageUpdateUI
  autoUpdaterInstance.autoDownload = false

  // Configure logging
  autoUpdaterInstance.logger = utils.logger

  // --- Centralized Event Handling ---
  autoUpdaterInstance.removeAllListeners() // Clear any previous listeners (important for HMR)

  autoUpdaterInstance.on('checking-for-update', () => {
    utils.log('Checking for updates...')
    // Optionally, could inform renderer here if needed, but main UI handles it
  })

  autoUpdaterInstance.on('update-available', (info) => {
    utils.log('Update available:', info.version)
    _manageUpdateUI('available', { info })
    // Send event to renderer for potential non-modal notification
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('update-available', info)
    }
  })

  autoUpdaterInstance.on('update-not-available', () => {
    utils.log('Update not available.')
    _manageUpdateUI('not-available')
  })

  autoUpdaterInstance.on('error', (err) => {
    // Error handled centrally
    _manageUpdateUI('error', { error: err })
    // Send event to renderer
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      const errorMessage = err.message || String(err)
      _mainWindow.webContents.send(
        'update-error',
        errorMessage.includes('API rate limit') ||
          errorMessage.includes('credentials') ||
          errorMessage.includes('Unauthorized')
          ? 'GitHub authentication error. A Personal Access Token may be required.'
          : errorMessage,
      )
    }
  })

  autoUpdaterInstance.on('download-progress', (progress) => {
    // Progress handled centrally
    _manageUpdateUI('progress', { progress })
  })

  autoUpdaterInstance.on('update-downloaded', (info) => {
    utils.log('Update downloaded:', info.version)
    _manageUpdateUI('downloaded', { downloadedInfo: info })
    // Send event to renderer for potential non-modal notification
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('update-downloaded', info)
    }
  })

  // --- Automatic Update Check Schedule ---
  // Only run automatic checks in production mode
  if (!isDev) {
    if (disableAutoUpdates) {
      utils.log('Auto-updates disabled via configuration')
      return
    }

    // Schedule update checks
    utils.log(`Initial update check scheduled in ${initialUpdateDelay / 1000}s`)
    const initialCheckTimeout = setTimeout(() => {
      utils.log('Performing initial update check.')
      autoUpdaterInstance.checkForUpdates().catch((err) => {
        // Don't show UI for initial check errors unless critical (handled by 'error' event)
        utils.logError('Initial update check failed:', err)
      })
    }, initialUpdateDelay)

    utils.log(`Periodic update check scheduled every ${updateCheckInterval / 1000 / 60} minutes`)
    const periodicCheckInterval = setInterval(() => {
      utils.log('Performing scheduled update check.')
      autoUpdaterInstance.checkForUpdates().catch((err) => {
        // Don't show UI for scheduled check errors (handled by 'error' event)
        utils.logError('Scheduled update check failed:', err)
      })
    }, updateCheckInterval)

    // Ensure timers are cleared on app quit
    app.on('will-quit', () => {
      clearTimeout(initialCheckTimeout)
      clearInterval(periodicCheckInterval)
    })
  } else {
    utils.log('Auto-updates disabled in development mode')
  }
}

/**
 * Register IPC handlers for update-related events
 * @param {BrowserWindow} mainWindow - The main application window
 */
function setupUpdateIpcHandlers(mainWindow) {
  // Ensure modules are loaded (needed if called before getAutoUpdater)
  if (!ipcMain) ipcMain = require('electron').ipcMain
  if (!app) app = require('electron').app

  const autoUpdaterInstance = getAutoUpdater()
  if (!autoUpdaterInstance) return

  // Clean up old handlers if they exist - prevents duplicates on HMR
  ipcMain.removeHandler('updates:check-manual')
  ipcMain.removeHandler('updates:download')
  ipcMain.removeHandler('updates:install')
  ipcMain.removeHandler('get-app-version')

  // --- IPC Handlers ---

  // Manual check triggered from Renderer/Menu -> Use simplified dialog function
  ipcMain.handle('updates:check-manual', async () => {
    // Manual checks are also disabled in dev by default now
    if (isDev) {
      utils.log('Manual update check skipped in dev mode.')
      // Show informative dialog instead of just skipping silently
      dialog.showMessageBox(_mainWindow, {
        type: 'info',
        title: 'Updates Disabled',
        message: 'Update checking is disabled in development mode.',
        detail: 'To test updates, please build a production version.',
        buttons: ['OK'],
      })
      return { success: false, message: 'Updates disabled in dev mode.' }
    }
    utils.log('Manual update check requested via IPC.')
    await _manageUpdateUI('check') // Start the UI flow
    return { success: true }
  })

  // Request to download update (e.g., from renderer notification)
  ipcMain.handle('updates:download', async () => {
    try {
      utils.log('Manual update download requested via IPC.')
      await _manageUpdateUI('downloading') // Show download UI
      await autoUpdaterInstance.downloadUpdate()
      return { success: true }
    } catch (err) {
      utils.logError('Error downloading update via IPC:', err)
      _manageUpdateUI('error', { error: err })
      return { success: false, message: err.message || String(err) }
    }
  })

  // Request to install update (e.g., from renderer notification)
  ipcMain.handle('updates:install', () => {
    utils.log('Manual update install requested via IPC.')
    autoUpdaterInstance.quitAndInstall(true, true)
    // No return needed as app will quit
  })

  // Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
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
 * Check for updates manually and show the UI flow.
 * This is typically called from menu items or buttons.
 * @param {BrowserWindow} mainWindow - The main browser window
 */
function checkForUpdatesWithDialog(mainWindow) {
  _mainWindow = mainWindow // Ensure mainWindow is set
  // Manual checks are also disabled in dev by default now
  if (isDev) {
    utils.log('Manual update check skipped in dev mode.')
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Updates Disabled',
      message: 'Update checking is disabled in development mode.',
      detail: 'To test updates, please build a production version.',
      buttons: ['OK'],
    })
    return
  }

  utils.log('Manual update check triggered (checkForUpdatesWithDialog).')
  _manageUpdateUI('check') // Start the unified UI flow
}

// RENDERER PROCESS CODE
// These functions are only used in the renderer process

/**
 * Initialize update listeners in the renderer process
 */
function initializeUpdateListeners() {
  if (typeof window === 'undefined' || !window.electronAPI?.updates) {
    utils.log('Update API not available in renderer')
    return
  }

  utils.log('Initializing update listeners in renderer')

  // Handle update available notification (from main process)
  window.electronAPI.updates.onUpdateAvailable((info) => {
    utils.log('Renderer received: update-available', info.version)
    // Show non-modal notification, clicking downloads
    showUpdateNotification(
      `Update Available: v${info.version}`,
      'A new version is available. Click to download.',
      async () => {
        utils.log('Renderer requesting download via notification click')
        removeUpdateNotification() // Hide notification once clicked
        const result = await window.electronAPI.updates.downloadUpdate()
        if (!result.success) {
          // Handle potential error during download initiation
          showUpdateNotification(
            'Download Error',
            `Failed to start download: ${result.message}`,
            removeUpdateNotification,
          )
        } else {
          // Show progress bar in notification area now
          showUpdateNotification(`Downloading v${info.version}`, 'Preparing download...', removeUpdateNotification) // Placeholder message
          updateDownloadProgress(0) // Show progress bar immediately
        }
      },
    )
  })

  // Handle update errors (from main process)
  window.electronAPI.updates.onUpdateError((message) => {
    utils.logError('Renderer received: update-error', message)
    // Optionally show an error notification/toast here, but the main process shows a dialog
    showUpdateNotification('Update Error', message, removeUpdateNotification)
  })

  // Handle download progress (from main process)
  window.electronAPI.updates.onDownloadProgress((progress) => {
    // Update the non-modal notification progress bar
    updateDownloadProgress(Math.floor(progress.percent || 0))
  })

  // Handle update downloaded (from main process)
  window.electronAPI.updates.onUpdateDownloaded((info) => {
    utils.log('Renderer received: update-downloaded', info.version)
    // Show non-modal notification, clicking installs
    showUpdateNotification(`Update Ready: v${info.version}`, 'Update downloaded. Click to install and restart.', () => {
      utils.log('Renderer requesting install via notification click')
      removeUpdateNotification() // Hide notification
      window.electronAPI.updates.installUpdate() // No need to await, app will quit
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

    // Update notification title/message during progress if needed
    const notificationContent = progressContainer.closest('.update-notification-content')
    if (notificationContent) {
      const titleElement = notificationContent.querySelector('h3')
      // Example: could update title based on percent if desired
      // if (percent > 0 && titleElement) titleElement.textContent = `Downloading... ${percent}%`;
    }
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

module.exports = {
  // Main process exports
  initialize,
  getAutoUpdater,
  checkForUpdatesWithDialog,

  // Renderer process exports
  initializeUpdateListeners,
  showUpdateNotification,
  removeUpdateNotification,
  updateDownloadProgress,
}
