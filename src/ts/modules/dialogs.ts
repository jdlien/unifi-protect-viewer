/**
 * Dialogs module to handle all application dialogs
 */

import { logError } from './utils'
import { imgPath } from './paths'

const { dialog, app, shell } = require('electron') as typeof import('electron')

let _isAboutDialogOpen = false
let _isResetDialogOpen = false

/** Reset dialog guard flags (test helper) */
export function _resetDialogGuards(): void {
  _isAboutDialogOpen = false
  _isResetDialogOpen = false
}

/**
 * Show native About dialog
 */
export async function showAboutDialog(mainWindow: Electron.BrowserWindow): Promise<void> {
  if (_isAboutDialogOpen) return
  _isAboutDialogOpen = true

  const appVersion = app.getVersion()
  const updates = require('./updates-main') as typeof import('./updates-main')

  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      title: 'About UniFi Protect Viewer',
      message: 'UniFi Protect Viewer',
      detail: `Version ${appVersion}\n\nA clean, standalone viewer for UniFi Protect cameras.\n\nDeveloped by JD Lien.`,
      buttons: ['Check for Updates', 'View on GitHub', 'Close'],
      defaultId: 2,
      cancelId: 2,
      noLink: true,
      icon: imgPath('128.png'),
    })

    if (response === 0) {
      await updates.checkForUpdatesWithDialog(mainWindow)
    } else if (response === 1) {
      shell.openExternal('https://github.com/jdlien/unifi-protect-viewer')
    }
  } catch (err: unknown) {
    logError('Error showing About dialog:', err)
  } finally {
    _isAboutDialogOpen = false
  }
}

/**
 * Show reset confirmation dialog
 */
export async function showResetConfirmation(mainWindow: Electron.BrowserWindow): Promise<boolean> {
  if (_isResetDialogOpen) return false
  _isResetDialogOpen = true

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

    return result.response === 1
  } catch (err) {
    logError('Error showing reset confirmation dialog:', err)
    return false
  } finally {
    _isResetDialogOpen = false
  }
}
