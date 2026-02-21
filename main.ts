// Modules to control application life and create native browser window
import * as utils from './src/ts/modules/utils'
import * as updates from './src/ts/modules/updates-main'
import * as windowManager from './src/ts/modules/window'
import * as ipcManager from './src/ts/modules/ipc'
import * as menuManager from './src/ts/modules/menu'

const { app } = require('electron') as typeof import('electron')

// Enable hot reloading in development mode
if (process.env.NODE_ENV === 'development') {
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
interface StoreInterface {
  get: (key: string) => unknown
  set: (...args: unknown[]) => void
  clear: () => void
  store: Record<string, unknown>
}

let store: StoreInterface

const resetRequested = process.argv.includes('--reset')

// Initialize store
async function initializeStore(): Promise<void> {
  try {
    const Store = (await import('electron-store')).default
    store = new Store() as unknown as StoreInterface
    if (resetRequested) {
      store.clear()
    }
  } catch (error) {
    console.error('Failed to initialize store:', error)
    // Create a memory-only store as fallback
    store = {
      get: (_key: string) => null,
      set: () => {},
      clear: () => {},
      store: {},
    }
  }
}

// Wait until Electron app is ready
async function start(): Promise<void> {
  await app.whenReady()
  await initializeStore()

  const mainWindow = await windowManager.createWindow(store)
  ipcManager.setupIpcHandlers(mainWindow, store)

  // Initialize update system with error handling
  try {
    updates.initialize(mainWindow)
  } catch (error) {
    utils.logError('Error initializing auto-update system:', error)
  }

  // Set up application menu
  menuManager.setupApplicationMenu(mainWindow, store)
}

// Start the app
start().catch((error: unknown) => {
  // Always log critical errors to console regardless of environment
  console.error('Error starting app:', error)
})
