/**
 * IPC module to handle communication between main and renderer processes
 */

import { log, logError } from './utils'

const { ipcMain, app } = require('electron') as typeof import('electron')

interface StoreInterface {
  store: Record<string, unknown>
  get: (key: string) => unknown
  set: (...args: unknown[]) => void
  clear: () => void
}

/**
 * Setup IPC handlers for communication between renderer and main process
 */
export function setupIpcHandlers(mainWindow: Electron.BrowserWindow, store: StoreInterface): void {
  ipcMain.handle('configLoad', () => {
    return store.store
  })

  ipcMain.on('configSave', (_event: Electron.IpcMainEvent, config: Record<string, unknown>) => {
    const updatedConfig = { ...store.store, ...config }
    store.set(updatedConfig)

    if (config.url && config.username && config.password) {
      mainWindow.loadURL(config.url as string)
    }
  })

  ipcMain.handle('configSavePartial', (_event: Electron.IpcMainInvokeEvent, partialConfig: Record<string, unknown>) => {
    Object.entries(partialConfig).forEach(([key, value]) => {
      store.set(key, value)
    })
    return true
  })

  ipcMain.on('loadURL', (_event: Electron.IpcMainEvent, url: string) => {
    log(`Loading URL: ${url}`)
    mainWindow.loadURL(url)
  })

  ipcMain.on('restart', () => {
    log('Restart requested')
    app.relaunch()
    app.exit()
  })

  ipcMain.on('reset', () => {
    log('Reset requested')
    store.clear()
  })

  ipcMain.on('toggleFullscreen', () => {
    log('Fullscreen toggle requested')
    if (mainWindow) {
      const isFullScreen = mainWindow.isFullScreen()
      mainWindow.setFullScreen(!isFullScreen)
    }
  })

  ipcMain.handle('isFullScreen', () => {
    return mainWindow ? mainWindow.isFullScreen() : false
  })

  if (mainWindow) {
    mainWindow.on('enter-full-screen', () => {
      log('Window entered fullscreen')
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fullscreen-change', true)
      }
      const menu = require('./menu') as typeof import('./menu')
      menu.updateFullscreenState(true)
    })

    mainWindow.on('leave-full-screen', () => {
      log('Window left fullscreen')
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fullscreen-change', false)
      }
      const menu = require('./menu') as typeof import('./menu')
      menu.updateFullscreenState(false)
    })
  }

  ipcMain.on('update-dashboard-state', (_event: Electron.IpcMainEvent, isDashboardPage: boolean) => {
    const menu = require('./menu') as typeof import('./menu')
    menu.updateDashboardState(isDashboardPage)
  })

  ipcMain.on('update-ui-state', (_event: Electron.IpcMainEvent, uiState: Record<string, unknown>) => {
    const menu = require('./menu') as typeof import('./menu')
    menu.updateUIState(uiState)
  })

  ipcMain.on(
    'update-camera-list',
    (
      _event: Electron.IpcMainEvent,
      data: { cameras: Array<{ index: number; name: string }>; zoomSupported: boolean },
    ) => {
      const menu = require('./menu') as typeof import('./menu')
      menu.updateCameraList(data.cameras, data.zoomSupported)
    },
  )

  ipcMain.on('update-camera-zoom', (_event: Electron.IpcMainEvent, zoomedIndex: number) => {
    const menu = require('./menu') as typeof import('./menu')
    menu.updateCameraZoom(zoomedIndex)
  })

  ipcMain.handle('getSystemDiagnostics', () => {
    return {
      hardwareAcceleration: app.isHardwareAccelerationEnabled(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
    }
  })

  ipcMain.handle('showResetConfirmation', async () => {
    const dialogs = require('./dialogs') as typeof import('./dialogs')
    return await dialogs.showResetConfirmation(mainWindow)
  })
}
