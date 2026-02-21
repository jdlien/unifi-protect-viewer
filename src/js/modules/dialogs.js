/**
 * Dialogs module to handle all application dialogs
 */

const { dialog, app, shell } = require('electron')
const path = require('node:path')
const utils = require('./utils')
const updates = require('./updates-main')

/**
 * Show native About dialog
 * @param {BrowserWindow} mainWindow - The main browser window
 */
function showAboutDialog(mainWindow) {
  const appVersion = app.getVersion()

  dialog
    .showMessageBox(mainWindow, {
      title: 'About UniFi Protect Viewer',
      message: 'UniFi Protect Viewer',
      detail: `Version ${appVersion}\n\nA clean, standalone viewer for UniFi Protect cameras.\n\nDeveloped by JD Lien.`,
      buttons: ['Check for Updates', 'View on GitHub', 'Close'],
      defaultId: 2,
      cancelId: 2,
      noLink: true,
      icon: path.join(__dirname, '../../img/128.png'),
    })
    .then(({ response }) => {
      if (response === 0) {
        // Check for updates
        updates.checkForUpdatesWithDialog(mainWindow)
      } else if (response === 1) {
        // View on GitHub
        shell.openExternal('https://github.com/jdlien/unifi-protect-viewer')
      }
    })
    .catch((err) => {
      utils.logError('Error showing About dialog:', err)
    })
}

/**
 * Show reset confirmation dialog
 * @param {BrowserWindow} mainWindow - The main browser window
 * @returns {Promise<boolean>} True if user confirmed reset, false otherwise
 */
async function showResetConfirmation(mainWindow) {
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Reset Configuration',
      message: 'Are you sure you want to reset all settings?',
      detail: 'This will clear all your saved settings including credentials.',
      buttons: ['Cancel', 'Reset'],
      defaultId: 0,
      cancelId: 0,
    })

    return result.response === 1 // Return true if "Reset" was clicked
  } catch (err) {
    utils.logError('Error showing reset confirmation dialog:', err)
    return false
  }
}

module.exports = {
  showAboutDialog,
  showResetConfirmation,
}
