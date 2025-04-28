/**
 * IPC module to handle communication between main and renderer processes
 */

const { ipcMain, dialog, app } = require('electron')
const utils = require('./utils')

/**
 * Setup IPC handlers for communication between renderer and main process
 * @param {BrowserWindow} mainWindow - The main browser window
 * @param {Object} store - The electron-store instance
 */
function setupIpcHandlers(mainWindow, store) {
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

      // Notify renderer about fullscreen state change
      event.sender.send('fullscreen-change', !isFullScreen)
    }
  })

  // Check if window is in fullscreen mode
  ipcMain.handle('isFullScreen', (event) => {
    return mainWindow ? mainWindow.isFullScreen() : false
  })

  // Listen for fullscreen state changes from Electron and relay to renderer
  if (mainWindow) {
    mainWindow.on('enter-full-screen', () => {
      utils.log('Window entered fullscreen')
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fullscreen-change', true)
      }
    })

    mainWindow.on('leave-full-screen', () => {
      utils.log('Window left fullscreen')
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fullscreen-change', false)
      }
    })
  }

  // Handle menu state updates from renderer
  ipcMain.on('update-dashboard-state', (event, isDashboardPage) => {
    // Get the menu module to update the dashboard state
    const menu = require('./menu')
    menu.updateDashboardState(isDashboardPage)
  })

  // Handle reset confirmation dialog
  ipcMain.handle('showResetConfirmation', async (event) => {
    const dialogs = require('./dialogs')
    return await dialogs.showResetConfirmation(mainWindow)
  })
}

module.exports = {
  setupIpcHandlers,
}
