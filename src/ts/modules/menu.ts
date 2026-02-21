/**
 * Menu module to handle application menu creation and state management
 */

import { log, logError } from './utils'
import * as dialogs from './dialogs'
import { htmlPath } from './paths'

const { app, Menu, shell, dialog } = require('electron') as typeof import('electron')

const isDev = process.env.NODE_ENV === 'development'

interface StoreInterface {
  clear: () => void
}

interface CameraEntry {
  index: number
  name: string
}

let mainMenu: Electron.Menu
let mainWindowRef: Electron.BrowserWindow | null = null
let storeRef: StoreInterface | null = null

// Dynamic state used when building the menu template
let visibilityState: Record<string, boolean> = { navHidden: false, headerHidden: false, widgetPanelExpanded: false }
let fullscreenState = false

// Camera menu state
let cameraListState: CameraEntry[] = []
let zoomedCameraIndex = -1
let cameraZoomSupported = true
let configPageState = false

/**
 * Build the Window menu using platform conventions.
 * - macOS: native window menu role
 * - Windows: minimal Window menu (minimize/close)
 */
function buildWindowMenu(): Electron.MenuItemConstructorOptions | null {
  if (process.platform === 'darwin') {
    return { role: 'windowMenu' }
  }

  if (process.platform === 'win32') {
    return {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    }
  }

  return null
}

/**
 * Build the menu template using current dynamic state
 */
function buildMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  const mainWindow = mainWindowRef!
  const store = storeRef!
  const windowMenu = buildWindowMenu()

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'About UniFi Protect Viewer',
          click: () => {
            dialogs.showAboutDialog(mainWindow)
          },
        },
        {
          label: 'Check for Updates',
          click: () => {
            const updates = require('./updates-main') as typeof import('./updates-main')
            updates.checkForUpdatesWithDialog(mainWindow)
          },
        },
        {
          label: 'Configuration',
          accelerator: 'CmdOrCtrl+,',
          enabled: !configPageState,
          click: () => {
            const configUrl = `file://${htmlPath('config.html')}`
            mainWindow.loadURL(configUrl)
          },
        },
        { type: 'separator' },
        {
          label: 'Restart Application',
          accelerator: 'F9',
          click: () => {
            app.relaunch()
            app.exit()
          },
        },
        {
          label: 'Reset Configuration',
          accelerator: 'F10',
          click: () => {
            dialog
              .showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Reset Configuration',
                message: 'Are you sure you want to reset all settings?',
                detail: 'This will clear all your saved settings including credentials.',
                buttons: ['Cancel', 'Reset'],
                defaultId: 0,
                cancelId: 0,
              })
              .then(({ response }) => {
                if (response === 1) {
                  store.clear()
                  app.relaunch()
                  app.exit()
                }
              })
          },
        },
        {
          label: 'Force Reset Configuration',
          accelerator: 'Shift+F10',
          click: () => {
            store.clear()
            app.relaunch()
            app.exit()
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
        { role: 'togglefullscreen', accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : undefined },
        {
          label: fullscreenState ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen())
          },
        },
        { type: 'separator' },
        {
          label:
            visibilityState.navHidden && visibilityState.headerHidden ? 'Show All Navigation' : 'Hide All Navigation',
          accelerator: 'Escape',
          click: () => {
            mainWindow.webContents.send('toggle-navigation')
          },
        },
        {
          label: visibilityState.navHidden ? 'Show Side Navigation' : 'Hide Side Navigation',
          accelerator: 'Alt+N',
          click: () => {
            mainWindow.webContents.send('toggle-nav-only')
          },
        },
        {
          label: visibilityState.headerHidden ? 'Show Header' : 'Hide Header',
          accelerator: 'Alt+H',
          click: () => {
            mainWindow.webContents.send('toggle-header-only')
          },
        },
        {
          label: visibilityState.widgetPanelExpanded ? 'Hide Widget Panel' : 'Show Widget Panel',
          accelerator: 'Alt+W',
          click: () => {
            mainWindow.webContents.send('toggle-widget-panel')
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
      label: 'Cameras',
      submenu:
        cameraListState.length > 0
          ? [
              ...cameraListState.map((cam, i) => ({
                label: cam.name,
                accelerator: i < 9 ? `${i + 1}` : undefined,
                registerAccelerator: false,
                type: 'checkbox' as const,
                checked: zoomedCameraIndex === cam.index,
                enabled: cameraZoomSupported,
                click: () => mainWindow.webContents.send('zoom-camera', cam.index),
              })),
              { type: 'separator' as const },
              {
                label: 'Show All Cameras',
                accelerator: '0',
                registerAccelerator: false,
                enabled: cameraZoomSupported && zoomedCameraIndex !== -1,
                click: () => mainWindow.webContents.send('zoom-camera', -1),
              },
            ]
          : [{ label: 'No cameras on this view', enabled: false }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            const updates = require('./updates-main') as typeof import('./updates-main')
            updates.checkForUpdatesWithDialog(mainWindow)
          },
        },
        {
          label: 'View on GitHub',
          click: () => {
            shell.openExternal('https://github.com/jdlien/unifi-protect-viewer')
          },
        },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          accelerator: 'F12',
          click: () => {
            try {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.toggleDevTools()
                log('DevTools toggled via menu')
              }
            } catch (err) {
              logError('Failed to toggle DevTools:', err)
            }
          },
        },
        ...(isDev
          ? [
              { type: 'separator' as const },
              {
                label: 'Simulate Update Download',
                click: () => {
                  const updates = require('./updates-main') as typeof import('./updates-main')
                  updates.simulateUpdateDownload(mainWindow)
                },
              },
            ]
          : []),
      ],
    },
  ]

  if (windowMenu) {
    template.splice(template.length - 1, 0, windowMenu)
  }

  return template
}

/**
 * Rebuild and re-set the application menu from current state
 */
function rebuildMenu(): void {
  if (!mainWindowRef) return
  mainMenu = Menu.buildFromTemplate(buildMenuTemplate())
  Menu.setApplicationMenu(mainMenu)
}

/**
 * Setup application menu
 */
export function setupApplicationMenu(mainWindow: Electron.BrowserWindow, store: StoreInterface): void {
  mainWindowRef = mainWindow
  storeRef = store

  rebuildMenu()

  mainWindow.webContents.on('did-navigate', () => {
    updateMenuState(mainWindow)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    updateMenuState(mainWindow)
  })

  updateMenuState(mainWindow)
}

/**
 * Update menu items based on current page
 */
export function updateMenuState(mainWindow: Electron.BrowserWindow): void {
  mainWindow.webContents
    .executeJavaScript(`window.location.href`)
    .then((currentUrl: string) => {
      // Dashboard item
      const isDashboardPage = currentUrl.includes('/protect/dashboard')
      const viewMenu = mainMenu.items.find((item) => item.label === 'View')
      if (viewMenu && viewMenu.submenu) {
        const dashboardItem = viewMenu.submenu.items.find((item) => item.label === 'Return to Dashboard')
        if (dashboardItem) {
          dashboardItem.enabled = !isDashboardPage
        }
      }

      // Config page state
      const isConfigPage = currentUrl.includes('/html/config.html')
      updateConfigPageState(isConfigPage)
    })
    .catch((error: unknown) => {
      logError('Error updating menu state:', error)
    })
}

/**
 * Update dashboard state in the menu
 */
export function updateDashboardState(isDashboardPage: boolean): void {
  const viewMenu = mainMenu?.items.find((item) => item.label === 'View')
  if (viewMenu && viewMenu.submenu) {
    const dashboardItem = viewMenu.submenu.items.find((item) => item.label === 'Return to Dashboard')
    if (dashboardItem) {
      dashboardItem.enabled = !isDashboardPage
    }
  }
}

/**
 * Update config page state in the menu (disables Configuration item when on config page)
 */
export function updateConfigPageState(isConfigPage: boolean): void {
  if (configPageState !== isConfigPage) {
    configPageState = isConfigPage
    rebuildMenu()
  }
}

/**
 * Update menu labels to reflect current nav/header visibility state
 */
export function updateUIState(uiState: Record<string, unknown>): void {
  visibilityState = { ...visibilityState, ...(uiState as Record<string, boolean>) }
  rebuildMenu()
}

/**
 * Update fullscreen menu label
 */
export function updateFullscreenState(isFullscreen: boolean): void {
  fullscreenState = isFullscreen
  rebuildMenu()
}

/**
 * Update the camera list shown in the Cameras menu
 */
export function updateCameraList(cameras: CameraEntry[], zoomSupported: boolean): void {
  cameraListState = cameras
  cameraZoomSupported = zoomSupported
  zoomedCameraIndex = -1
  rebuildMenu()
}

/**
 * Update which camera is currently zoomed (for checkmark in menu)
 */
export function updateCameraZoom(index: number): void {
  zoomedCameraIndex = index
  rebuildMenu()
}
