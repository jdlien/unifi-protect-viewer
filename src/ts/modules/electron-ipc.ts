/**
 * Thin wrapper around electron's IPC modules.
 *
 * Source modules import from here instead of directly from 'electron'.
 * This enables test mocking — vi.mock() works for local modules but
 * cannot intercept CJS require('electron') from the npm package.
 */

const { ipcRenderer } = require('electron') as typeof import('electron')

export { ipcRenderer }
