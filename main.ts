// Modules to control application life and create native browser window
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as utils from './src/ts/modules/utils'
import * as updates from './src/ts/modules/updates-main'
import * as windowManager from './src/ts/modules/window'
import * as ipcManager from './src/ts/modules/ipc'
import * as menuManager from './src/ts/modules/menu'

const { app, protocol, net } = require('electron') as typeof import('electron')

// Register custom app:// protocol for secure local file access
// Must be called before app.whenReady() — file:// is blocked by GrantFileProtocolExtraPrivileges fuse
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

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

  // Register app:// protocol handler to serve local files from the app root
  const appRoot = app.getAppPath()
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const filePath = path.resolve(appRoot, decodeURIComponent(pathname).replace(/^\//, ''))
    if (!filePath.startsWith(appRoot)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })

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
