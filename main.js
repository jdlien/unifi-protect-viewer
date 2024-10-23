// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// some const
const userAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
const defaultWidth = 1270
const defaultHeight = 750

// portable use
const portable = false
const portableStoreCwd = path.join(process.resourcesPath, 'store')
const encryptionKey = '****'

// Store initialization
let store

// Initialize store
async function initializeStore() {
  const Store = (await import('electron-store')).default

  // Create portable directory if needed
  if (portable && !fs.existsSync(portableStoreCwd)) {
    fs.mkdirSync(portableStoreCwd)
  }

  // Initialize store with appropriate config
  store = portable
    ? new Store({ name: 'storage', fileExtension: 'db', cwd: portableStoreCwd, encryptionKey: encryptionKey })
    : new Store()
}

// cause self-signed certificate
app.commandLine.appendSwitch('ignore-certificate-errors', 'true')

// dev
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reloader')(module)
  } catch (_) {}
}

// event handlers
function handleReset() {
  store.clear()
}

function handleRestart() {
  app.quit()
  app.relaunch()
}

async function handleConfigLoad() {
  return store.get('config')
}

function handleConfigSave(event, config) {
  store.set('config', config)
}

// window handler
async function handleWindow(mainWindow) {
  if (process.env.NODE_ENV === 'development') {
    setTimeout(() => mainWindow.webContents.openDevTools(), 1000)
  }

  if (store.has('config')) {
    // do not await here, the file is the fallback if the url cannot be loaded
    mainWindow.loadFile('./src/html/index.html').then()

    await mainWindow.loadURL(store.get('config').url, {
      userAgent: userAgent,
    })
  } else {
    await mainWindow.loadFile('./src/html/config.html')
  }

  if (!store.has('init')) {
    store.set('init', true)
  }
}

async function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: store.get('bounds')?.width || defaultWidth,
    height: store.get('bounds')?.height || defaultHeight,
    x: store.get('bounds')?.x || undefined,
    y: store.get('bounds')?.y || undefined,
    webPreferences: {
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, '/src/js/preload.js'),
      allowDisplayingInsecureContent: true,
      allowRunningInsecureContent: true,
    },

    icon: path.join(__dirname, '/src/img/128.png'),

    frame: true,
    movable: true,
    resizable: true,
    closable: true,
    darkTheme: true,
    autoHideMenuBar: true,
  })

  // set the main window title
  mainWindow.setTitle('UniFi Protect Viewer')

  // disable automatic app title updates
  mainWindow.on('page-title-updated', function (e) {
    e.preventDefault()
  })

  // save bounds to store on close
  mainWindow.on('close', function () {
    if (store.has('init') && !portable) {
      store.set('bounds', mainWindow.getBounds())
    }
  })

  // and load the index.html of the app.
  await handleWindow(mainWindow)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Initialize store first
  await initializeStore()

  ipcMain.on('reset', handleReset)
  ipcMain.on('restart', handleRestart)
  ipcMain.on('configSave', handleConfigSave)

  ipcMain.handle('configLoad', handleConfigLoad)

  await createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Handle showing a confirmation dialog when resetting the app
  ipcMain.handle('showResetConfirmation', async (event) => {
    const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
      type: 'question',
      buttons: ['Cancel', 'Reset'],
      defaultId: 0,
      title: 'Confirm Reset',
      message: 'Are you sure you want to reset the app settings?',
    })
    return result.response === 1 // Returns true if 'Reset' was clicked
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
