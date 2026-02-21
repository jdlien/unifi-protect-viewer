/**
 * Menu module to handle application menu creation and state management
 */

const { app, Menu, shell, dialog } = require('electron')
const path = require('node:path')
const utils = require('./utils')
const dialogs = require('./dialogs')
const windowManager = require('./window')

const isDev = process.env.NODE_ENV === 'development'

let mainMenu // Store the menu instance globally within the module
let mainWindowRef = null
let storeRef = null

// Dynamic state used when building the menu template
let visibilityState = { navHidden: false, headerHidden: false, widgetPanelExpanded: false }
let fullscreenState = false

// Camera menu state
let cameraListState = [] // [{ index: 0, name: 'Front Porch' }, ...]
let zoomedCameraIndex = -1
let cameraZoomSupported = true

/**
 * Build the menu template using current dynamic state
 */
function buildMenuTemplate() {
  const mainWindow = mainWindowRef
  const store = storeRef

  return [
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
            const updates = require('./updates')
            updates.checkForUpdatesWithDialog(mainWindow)
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
                  // Reset was clicked
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
        { role: 'togglefullscreen', accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : null },
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
                type: 'checkbox',
                checked: zoomedCameraIndex === cam.index,
                enabled: cameraZoomSupported,
                click: () => mainWindow.webContents.send('zoom-camera', cam.index),
              })),
              { type: 'separator' },
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
            const updates = require('./updates')
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
                utils.log('DevTools toggled via menu')
              }
            } catch (err) {
              utils.logError('Failed to toggle DevTools:', err)
            }
          },
        },
      ],
    },
  ]
}

/**
 * Rebuild and re-set the application menu from current state
 */
function rebuildMenu() {
  if (!mainWindowRef) return
  mainMenu = Menu.buildFromTemplate(buildMenuTemplate())
  Menu.setApplicationMenu(mainMenu)
}

/**
 * Setup application menu
 * @param {BrowserWindow} mainWindow - The main browser window
 * @param {Object} store - The electron-store instance
 */
function setupApplicationMenu(mainWindow, store) {
  mainWindowRef = mainWindow
  storeRef = store

  rebuildMenu()

  // Set up listeners for navigation events to update menu
  mainWindow.webContents.on('did-navigate', () => {
    updateMenuState(mainWindow)
  })

  // Also update on page load completion for SPAs
  mainWindow.webContents.on('did-finish-load', () => {
    updateMenuState(mainWindow)
  })

  // Initial menu state update
  updateMenuState(mainWindow)
}

/**
 * Update menu items based on current page
 * @param {BrowserWindow} mainWindow - The main browser window
 */
function updateMenuState(mainWindow) {
  // Check if we're on a dashboard page
  mainWindow.webContents
    .executeJavaScript(
      `
    // Use the dashboard module to check if we're on a dashboard page
    window.location.href.includes('/protect/dashboard')
  `,
    )
    .then((isDashboardPage) => {
      // Find the Return to Dashboard menu item
      const viewMenu = mainMenu.items.find((item) => item.label === 'View')
      if (viewMenu && viewMenu.submenu) {
        const dashboardItem = viewMenu.submenu.items.find((item) => item.label === 'Return to Dashboard')
        if (dashboardItem) {
          dashboardItem.enabled = !isDashboardPage
        }
      }
    })
    .catch((error) => {
      utils.logError('Error updating menu state:', error)
    })
}

/**
 * Update dashboard state in the menu
 * @param {boolean} isDashboardPage - Whether the current page is a dashboard
 */
function updateDashboardState(isDashboardPage) {
  const viewMenu = mainMenu?.items.find((item) => item.label === 'View')
  if (viewMenu && viewMenu.submenu) {
    const dashboardItem = viewMenu.submenu.items.find((item) => item.label === 'Return to Dashboard')
    if (dashboardItem) {
      dashboardItem.enabled = !isDashboardPage
    }
  }
}

/**
 * Update menu labels to reflect current nav/header visibility state
 * @param {Object} uiState - { navHidden: boolean, headerHidden: boolean }
 */
function updateUIState(uiState) {
  visibilityState = { ...visibilityState, ...uiState }
  rebuildMenu()
}

/**
 * Update fullscreen menu label
 * @param {boolean} isFullscreen - Whether the window is in fullscreen
 */
function updateFullscreenState(isFullscreen) {
  fullscreenState = isFullscreen
  rebuildMenu()
}

/**
 * Update the camera list shown in the Cameras menu
 * @param {Array<{index: number, name: string}>} cameras
 * @param {boolean} zoomSupported
 */
function updateCameraList(cameras, zoomSupported) {
  cameraListState = cameras
  cameraZoomSupported = zoomSupported
  zoomedCameraIndex = -1
  rebuildMenu()
}

/**
 * Update which camera is currently zoomed (for checkmark in menu)
 * @param {number} index - Zoomed viewport index, or -1 for none
 */
function updateCameraZoom(index) {
  zoomedCameraIndex = index
  rebuildMenu()
}

module.exports = {
  setupApplicationMenu,
  updateMenuState,
  updateDashboardState,
  updateUIState,
  updateFullscreenState,
  updateCameraList,
  updateCameraZoom,
}
