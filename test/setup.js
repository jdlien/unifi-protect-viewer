/**
 * Vitest setup file — runs before every test file.
 *
 * Mocks the `electron` module so renderer-side code that calls
 * require('electron') gets safe stubs instead of crashing.
 */

import { vi } from 'vitest'

// Mock electron module
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({}),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  app: {
    getVersion: vi.fn().mockReturnValue('2.0.0-test'),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
  shell: {
    openExternal: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn(),
  },
}))

// Mock electron-updater (main process only, but prevents import crashes)
vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    logger: null,
    autoDownload: false,
  },
}))

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      store: {},
    })),
  }
})
