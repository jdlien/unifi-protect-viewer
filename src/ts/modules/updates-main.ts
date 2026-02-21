/**
 * Updates module — main process only.
 *
 * Handles auto-updater setup, modal BrowserWindow dialogs, IPC handlers,
 * and periodic update scheduling. Imported by main.ts, menu.ts, dialogs.ts.
 */

import { log, logError, logWarn, logger } from './utils'
import { htmlUrl, downloadPreloadPath } from './paths'

const isDev = process.env.NODE_ENV === 'development'

const disableAutoUpdates = process.env.DISABLE_AUTO_UPDATES === 'true'
const updateCheckInterval = parseInt(process.env.UPDATE_CHECK_INTERVAL || '21600000', 10)
const initialUpdateDelay = parseInt(process.env.INITIAL_UPDATE_DELAY || '10000', 10)

let autoUpdater: any
let dialog: typeof import('electron').dialog
let app: typeof import('electron').app
let ipcMain: typeof import('electron').ipcMain
let BrowserWindow: typeof import('electron').BrowserWindow
let nativeTheme: typeof import('electron').nativeTheme
let _mainWindow: Electron.BrowserWindow | null = null
let isManualCheckInProgress = false
let checkingDialog: Electron.BrowserWindow | null = null
let downloadDialog: Electron.BrowserWindow | null = null

/**
 * Platform-specific BrowserWindow options for translucent dialog appearance.
 * - macOS: vibrancy blur effect with transparent background
 * - Windows: Mica material (Win11) with solid fallback color
 * - Linux: solid background color
 */
function getDialogAppearanceOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
  if (process.platform === 'darwin') {
    return {
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
    }
  }

  if (!nativeTheme) nativeTheme = require('electron').nativeTheme
  const bgColor = nativeTheme.shouldUseDarkColors ? '#2d2d2d' : '#f0f0f0'

  if (process.platform === 'win32') {
    return {
      backgroundMaterial: 'mica',
      backgroundColor: bgColor,
    }
  }

  // Linux and other platforms
  return { backgroundColor: bgColor }
}

/**
 * Handle GitHub authentication error messages
 */
function getGitHubErrorMessage(errorMessage: string): string {
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

function getAutoUpdater(): any {
  if (!autoUpdater) {
    try {
      autoUpdater = require('electron-updater').autoUpdater
      dialog = require('electron').dialog
      app = require('electron').app
      ipcMain = require('electron').ipcMain
      BrowserWindow = require('electron').BrowserWindow

      if (autoUpdater && !autoUpdater.logger) {
        autoUpdater.logger = logger
      }

      if (!autoUpdater || typeof autoUpdater.checkForUpdates !== 'function') {
        throw new Error('Invalid autoUpdater instance - missing methods')
      }
    } catch (err) {
      logError('Failed to load auto-updater:', err)
      return createDummyAutoUpdater()
    }
  }
  return autoUpdater
}

function createDummyAutoUpdater(): any {
  const dummyEventEmitter: Record<string, any> = {
    _events: {} as Record<string, Array<(...args: unknown[]) => void>>,
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!this._events[event]) this._events[event] = []
      this._events[event].push(listener)
      return this
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      const onceWrapper = (...args: unknown[]) => {
        this.removeListener(event, onceWrapper)
        listener.apply(this, args)
      }
      this.on(event, onceWrapper)
      return this
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      if (this._events[event]) {
        this._events[event] = this._events[event].filter((l: (...args: unknown[]) => void) => l !== listener)
      }
      return this
    },
    emit(event: string, ...args: unknown[]) {
      if (this._events[event]) {
        this._events[event].forEach((listener: (...args: unknown[]) => void) => listener(...args))
      }
      return true
    },
  }

  return Object.assign(dummyEventEmitter, {
    logger,
    autoDownload: false,
    checkForUpdates: () => {
      log('[Dummy] Check for updates called')
      setTimeout(() => dummyEventEmitter.emit('update-not-available'), 500)
      return Promise.resolve()
    },
    downloadUpdate: () => {
      log('[Dummy] Download update called')
      return Promise.resolve()
    },
    quitAndInstall: () => {
      log('[Dummy] Quit and install called')
    },
    removeAllListeners: () => {
      dummyEventEmitter._events = {}
      return dummyEventEmitter
    },
  })
}

function _closeCheckingDialog(): void {
  if (checkingDialog && !checkingDialog.isDestroyed()) {
    checkingDialog.close()
  }
  checkingDialog = null
}

function _closeDownloadDialog(): void {
  if (downloadDialog && !downloadDialog.isDestroyed()) {
    downloadDialog.close()
  }
  downloadDialog = null
}

async function _manageUpdateUI(step: string, data?: any): Promise<void> {
  if (!_mainWindow || _mainWindow.isDestroyed()) {
    logError('Update UI cannot be shown: main window is not available.')
    return
  }

  const autoUpdaterInstance = getAutoUpdater()

  switch (step) {
    case 'check':
      _closeCheckingDialog()
      _closeDownloadDialog()

      isManualCheckInProgress = true
      log('Showing checking for updates window.')

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
        autoHideMenuBar: true,
        title: 'Checking for Updates',
        ...getDialogAppearanceOptions(),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      checkingDialog.removeMenu()
      checkingDialog.loadURL(htmlUrl('update-checking.html'))
      checkingDialog.once('ready-to-show', () => checkingDialog!.show())
      checkingDialog.on('closed', () => {
        checkingDialog = null
      })

      try {
        await autoUpdaterInstance.checkForUpdates()
      } catch (err) {
        logError('Error initiating update check:', err)
        _manageUpdateUI('error', { error: err })
      }
      break

    case 'available': {
      _closeCheckingDialog()
      const { info } = data

      log(`Showing update available dialog for version ${info.version}`)
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
        _manageUpdateUI('downloading')
        try {
          await autoUpdaterInstance.downloadUpdate()
        } catch (err) {
          logError('Error starting update download:', err)
          _manageUpdateUI('error', err)
        }
      } else {
        isManualCheckInProgress = false
      }
      break
    }

    case 'downloading':
      _closeCheckingDialog()
      _closeDownloadDialog()

      log('Showing downloading update window.')
      downloadDialog = new BrowserWindow({
        parent: _mainWindow,
        modal: true,
        show: false,
        width: 400,
        height: 200,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        autoHideMenuBar: true,
        title: 'Downloading Update',
        ...getDialogAppearanceOptions(),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: downloadPreloadPath(),
        },
      })
      downloadDialog.removeMenu()
      downloadDialog.loadURL(htmlUrl('update-downloading.html'))
      downloadDialog.once('ready-to-show', () => downloadDialog!.show())
      downloadDialog.on('closed', () => {
        downloadDialog = null
      })
      break

    case 'progress':
      if (downloadDialog && !downloadDialog.isDestroyed()) {
        downloadDialog.webContents.send('update-progress', data.progress)
      }
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('download-progress', data.progress)
      }
      break

    case 'downloaded': {
      _closeDownloadDialog()
      const { downloadedInfo } = data

      log(`Showing update downloaded dialog for version ${downloadedInfo.version}`)
      const { response: restartResponse } = await dialog.showMessageBox(_mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Update Downloaded (v${downloadedInfo.version})`,
        detail: 'The update has been downloaded. Restart the application to apply the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })

      isManualCheckInProgress = false

      if (restartResponse === 0) {
        autoUpdaterInstance.quitAndInstall(true, true)
      }
      break
    }

    case 'not-available':
      _closeCheckingDialog()
      if (isManualCheckInProgress) {
        log('Showing no updates available dialog.')
        dialog.showMessageBox(_mainWindow, {
          type: 'info',
          title: 'No Updates',
          message: 'You have the latest version',
          detail: `Version ${app.getVersion()} is the latest version available.`,
          buttons: ['OK'],
        })
      } else {
        log('No updates available (automatic check).')
      }
      isManualCheckInProgress = false
      break

    case 'error': {
      _closeCheckingDialog()
      _closeDownloadDialog()
      isManualCheckInProgress = false

      const error = data?.error || new Error('Unknown update error')
      const errorMessage = error.message || String(error)
      logError('Update error occurred:', errorMessage)

      dialog.showMessageBox(_mainWindow, {
        type: 'error',
        title: 'Update Error',
        message: 'Error During Update Process',
        detail: getGitHubErrorMessage(errorMessage),
        buttons: ['OK'],
      })
      break
    }

    default:
      logWarn(`_manageUpdateUI called with unknown step: ${step}`)
  }
}

function setupAutoUpdater(mainWindow: Electron.BrowserWindow): void {
  _mainWindow = mainWindow
  const autoUpdaterInstance = getAutoUpdater()
  if (!autoUpdaterInstance) return

  autoUpdaterInstance.autoDownload = false
  autoUpdaterInstance.logger = logger

  autoUpdaterInstance.removeAllListeners()

  autoUpdaterInstance.on('checking-for-update', () => {
    log('Checking for updates...')
  })

  autoUpdaterInstance.on('update-available', (info: any) => {
    log('Update available:', info.version)
    _manageUpdateUI('available', { info })
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('update-available', info)
    }
  })

  autoUpdaterInstance.on('update-not-available', () => {
    log('Update not available.')
    _manageUpdateUI('not-available')
  })

  autoUpdaterInstance.on('error', (err: Error) => {
    _manageUpdateUI('error', { error: err })
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

  autoUpdaterInstance.on('download-progress', (progress: any) => {
    _manageUpdateUI('progress', { progress })
  })

  autoUpdaterInstance.on('update-downloaded', (info: any) => {
    log('Update downloaded:', info.version)
    _manageUpdateUI('downloaded', { downloadedInfo: info })
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('update-downloaded', info)
    }
  })

  if (!isDev) {
    if (disableAutoUpdates) {
      log('Auto-updates disabled via configuration')
      return
    }

    log(`Initial update check scheduled in ${initialUpdateDelay / 1000}s`)
    const initialCheckTimeout = setTimeout(() => {
      log('Performing initial update check.')
      autoUpdaterInstance.checkForUpdates().catch((err: unknown) => {
        logError('Initial update check failed:', err)
      })
    }, initialUpdateDelay)

    log(`Periodic update check scheduled every ${updateCheckInterval / 1000 / 60} minutes`)
    const periodicCheckInterval = setInterval(() => {
      log('Performing scheduled update check.')
      autoUpdaterInstance.checkForUpdates().catch((err: unknown) => {
        logError('Scheduled update check failed:', err)
      })
    }, updateCheckInterval)

    app.on('will-quit', () => {
      clearTimeout(initialCheckTimeout)
      clearInterval(periodicCheckInterval)
    })
  } else {
    log('Auto-updates disabled in development mode')
  }
}

function setupUpdateIpcHandlers(mainWindow: Electron.BrowserWindow): void {
  if (!ipcMain) ipcMain = require('electron').ipcMain
  if (!app) app = require('electron').app
  if (!dialog) dialog = require('electron').dialog

  const autoUpdaterInstance = getAutoUpdater()
  if (!autoUpdaterInstance) return

  ipcMain.removeHandler('updates:check-manual')
  ipcMain.removeHandler('updates:download')
  ipcMain.removeHandler('updates:install')
  ipcMain.removeHandler('get-app-version')

  ipcMain.handle('updates:check-manual', async () => {
    if (isDev) {
      log('Manual update check skipped in dev mode.')
      dialog.showMessageBox(_mainWindow!, {
        type: 'info',
        title: 'Updates Disabled',
        message: 'Update checking is disabled in development mode.',
        detail: 'To test updates, please build a production version.',
        buttons: ['OK'],
      })
      return { success: false, message: 'Updates disabled in dev mode.' }
    }
    log('Manual update check requested via IPC.')
    await _manageUpdateUI('check')
    return { success: true }
  })

  ipcMain.handle('updates:download', async () => {
    try {
      log('Manual update download requested via IPC.')
      await _manageUpdateUI('downloading')
      await autoUpdaterInstance.downloadUpdate()
      return { success: true }
    } catch (err: any) {
      logError('Error downloading update via IPC:', err)
      _manageUpdateUI('error', { error: err })
      return { success: false, message: err.message || String(err) }
    }
  })

  ipcMain.handle('updates:install', () => {
    log('Manual update install requested via IPC.')
    autoUpdaterInstance.quitAndInstall(true, true)
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })
}

/**
 * Initialize update functionality - main process entry point
 */
export function initialize(mainWindow: Electron.BrowserWindow): void {
  setupAutoUpdater(mainWindow)
  setupUpdateIpcHandlers(mainWindow)
}

/**
 * Get the auto-updater instance (for external access)
 */
export { getAutoUpdater }

/**
 * Check for updates manually and show the UI flow.
 */
export function checkForUpdatesWithDialog(mainWindow: Electron.BrowserWindow): void {
  _mainWindow = mainWindow
  if (isDev) {
    log('Manual update check skipped in dev mode.')
    if (!dialog) dialog = require('electron').dialog
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Updates Disabled',
      message: 'Update checking is disabled in development mode.',
      detail: 'Use Help → Simulate Update Download to test the download progress UI.',
      buttons: ['OK'],
    })
    return
  }

  log('Manual update check triggered (checkForUpdatesWithDialog).')
  _manageUpdateUI('check')
}

/**
 * Simulate an update download with fake progress for UI testing.
 * Only works in dev mode — used to verify the download progress dialog renders correctly.
 */
export async function simulateUpdateDownload(mainWindow: Electron.BrowserWindow): Promise<void> {
  _mainWindow = mainWindow
  if (!BrowserWindow) BrowserWindow = require('electron').BrowserWindow
  if (!dialog) dialog = require('electron').dialog

  log('Simulating update download...')

  await _manageUpdateUI('downloading')

  // Wait for the dialog to be ready before sending progress
  await new Promise<void>((resolve) => setTimeout(resolve, 500))

  const totalBytes = 85 * 1024 * 1024 // Simulate 85 MB download
  const steps = 50
  const intervalMs = 100

  for (let i = 1; i <= steps; i++) {
    if (!downloadDialog || downloadDialog.isDestroyed()) break

    const percent = (i / steps) * 100
    const transferred = (i / steps) * totalBytes
    // Simulate varying speed (2-8 MB/s)
    const bytesPerSecond = (2 + Math.random() * 6) * 1024 * 1024

    await _manageUpdateUI('progress', {
      progress: {
        percent,
        transferred,
        total: totalBytes,
        bytesPerSecond,
        delta: transferred / i,
      },
    })

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
  }

  _closeDownloadDialog()

  if (_mainWindow && !_mainWindow.isDestroyed()) {
    dialog.showMessageBox(_mainWindow, {
      type: 'info',
      title: 'Simulation Complete',
      message: 'Update Download Simulation Complete',
      detail: 'The download progress dialog has been tested. In production, this would prompt to restart.',
      buttons: ['OK'],
    })
  }

  log('Update download simulation complete.')
}
