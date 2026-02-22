import { vi } from 'vitest'
export const ipcRenderer = {
  invoke: vi.fn().mockResolvedValue({}),
  send: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
}
export const contextBridge = {
  exposeInMainWorld: vi.fn(),
}
export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
}
export const app = {
  getVersion: vi.fn().mockReturnValue('2.0.0-test'),
  getAppPath: vi.fn().mockReturnValue('/mock/app'),
  whenReady: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  quit: vi.fn(),
}
export const BrowserWindow = vi.fn()
export const nativeTheme = { shouldUseDarkColors: false }
export const session = {
  defaultSession: { flushStorageData: vi.fn() },
}
export const globalShortcut = { unregisterAll: vi.fn() }
export const dialog = {
  showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
}
export const shell = {
  openExternal: vi.fn(),
}
export const Menu = {
  buildFromTemplate: vi.fn(),
  setApplicationMenu: vi.fn(),
}
