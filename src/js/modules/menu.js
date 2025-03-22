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

/**
 * Setup application menu
 * @param {BrowserWindow} mainWindow - The main browser window
 * @param {Object} store - The electron-store instance
 */
function setupApplicationMenu(mainWindow, store) {
  const template = [
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
          label: 'Toggle Fullscreen (F11)',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen())
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle All Navigation',
          accelerator: 'Escape',
          click: () => {
            mainWindow.webContents.send('toggle-navigation')
          },
        },
        {
          label: 'Toggle Side Navigation',
          accelerator: 'Alt+N',
          click: () => {
            mainWindow.webContents.send('toggle-nav-only')
          },
        },
        {
          label: 'Toggle Header Only',
          accelerator: 'Alt+H',
          click: () => {
            mainWindow.webContents.send('toggle-header-only')
          },
        },
        {
          label: 'Toggle Widget Panel',
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
      ],
    },
  ]

  // Add development menu in dev mode
  if (isDev) {
    template.push({
      label: 'Development',
      submenu: [
        {
          label: 'Simulate Update Download',
          click: () => {
            const updates = require('./updates')
            updates.simulateDownloadForDev(mainWindow)
          },
        },
        {
          label: 'Open DevTools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.openDevTools({ mode: 'right' })
            }
          },
        },
      ],
    })
  }

  mainMenu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(mainMenu)

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

module.exports = {
  setupApplicationMenu,
  updateMenuState,
  updateDashboardState,
}
