/**
 * Window module to handle browser window creation and configuration
 */

import { URL } from 'node:url'
import { log, logError } from './utils'
import * as version from './version'
import { htmlPath, htmlUrl, imgPath, preloadPath } from './paths'

const { BrowserWindow, app, shell, globalShortcut } = require('electron') as typeof import('electron')

// Constants
const DEFAULT_WIDTH = 1270
const DEFAULT_HEIGHT = 750

interface StoreInterface {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

/**
 * Create the browser window.
 */
export async function createWindow(store: StoreInterface): Promise<Electron.BrowserWindow> {
  const bounds = store.get('bounds') as { width?: number; height?: number; x?: number; y?: number } | undefined
  const mainWindow = new BrowserWindow({
    width: bounds?.width || DEFAULT_WIDTH,
    height: bounds?.height || DEFAULT_HEIGHT,
    x: bounds?.x || undefined,
    y: bounds?.y || undefined,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
    },
    icon: imgPath('128.png'),
    frame: true,
    autoHideMenuBar: true,
  })

  mainWindow.webContents.setUserAgent(version.userAgent)

  mainWindow.setTitle(`UniFi Protect Viewer ${app.getVersion()}`)

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    log('Opening DevTools (development mode)')
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        try {
          mainWindow.webContents.openDevTools({ mode: 'right' })
          log('DevTools opened successfully')
        } catch (err) {
          logError('Error opening DevTools:', err)
        }
      }, 1000)
    })
  }

  mainWindow.webContents.on('certificate-error', handleCertificateError(store))

  mainWindow.on('close', () => {
    store.set('bounds', mainWindow.getBounds())
  })

  const initialUrl = (store.get('url') as string) || 'about:blank'
  log(`Loading initial URL: ${initialUrl}`)
  mainWindow.loadURL(initialUrl)

  if (initialUrl === 'about:blank') {
    mainWindow.loadURL(htmlUrl('config.html'))
  }

  setupWindowNavigation(mainWindow, store)

  mainWindow.on('closed', () => app.quit())

  mainWindow.once('ready-to-show', () => {
    registerDevToolsShortcut(mainWindow)
  })

  return mainWindow
}

/**
 * Handle certificate errors during navigation
 */
export function handleCertificateError(
  store: StoreInterface,
): (
  event: Electron.Event,
  urlString: string,
  error: string,
  certificate: Electron.Certificate,
  callback: (isTrusted: boolean) => void,
) => void {
  return (event, urlString, _error, _certificate, callback) => {
    const configUrl = store.get('url') as string | undefined
    const ignoreCertErrors = (store.get('ignoreCertErrors') as boolean) || false

    if (ignoreCertErrors && configUrl) {
      try {
        const configDomain = new URL(configUrl).hostname
        const requestDomain = new URL(urlString).hostname

        if (configDomain === requestDomain) {
          log(`Bypassing certificate error for configured domain: ${requestDomain}`)
          event.preventDefault()
          callback(true)
          return
        }
      } catch (err) {
        log('Error parsing URL when handling certificate error:', err)
      }
    }

    callback(false)
  }
}

/**
 * Set up window navigation handlers
 */
export function setupWindowNavigation(mainWindow: Electron.BrowserWindow, store: StoreInterface): void {
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    log(`Window open request for ${url}`)

    if (url.startsWith((store.get('url') as string) || '') || url.startsWith('file://') || url.startsWith('app://')) {
      mainWindow.loadURL(url)
    } else {
      log(`Blocked navigation to external URL: ${url}`)
    }

    return { action: 'deny' }
  })

  let isShowingErrorPage = false

  mainWindow.webContents.on(
    'did-fail-load',
    (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ) => {
      if (errorCode === -3 || !isMainFrame || isShowingErrorPage) return

      isShowingErrorPage = true
      const errorPage = `${htmlUrl('error.html')}?error=${encodeURIComponent(errorDescription)}&url=${encodeURIComponent(validatedURL)}`
      mainWindow.loadURL(errorPage)
    },
  )

  mainWindow.webContents.on('did-finish-load', () => {
    isShowingErrorPage = false
  })
}

/**
 * Register the shortcut for DevTools
 */
export function registerDevToolsShortcut(window: Electron.BrowserWindow): void {
  try {
    if (window && !window.isDestroyed()) {
      window.webContents.on('before-input-event', (event: Electron.Event, input: Electron.Input) => {
        if (input.key === 'F12' && !input.control && !input.meta && !input.alt && !input.shift) {
          window.webContents.toggleDevTools()
          log('DevTools toggled via F12 local shortcut')
          event.preventDefault()
        }
      })
      log('Local F12 shortcut registered for DevTools')
    }
  } catch (err) {
    logError('Error registering F12 shortcut:', err)
  }
}

/**
 * Release all global shortcuts and resources
 */
export function cleanupResources(): void {
  log('Cleaning up resources')

  try {
    globalShortcut.unregisterAll()
  } catch (err) {
    logError('Error unregistering shortcuts:', err)
  }
}

// Clean up resources when app is about to quit
app.on('will-quit', cleanupResources)

/**
 * Open DevTools directly
 */
export function openDevTools(window: Electron.BrowserWindow, options: { mode?: string } = { mode: 'right' }): boolean {
  if (window && !window.isDestroyed()) {
    try {
      window.webContents.openDevTools(options as Electron.OpenDevToolsOptions)
      return true
    } catch (err) {
      logError('Error opening DevTools:', err)
      return false
    }
  }
  return false
}
