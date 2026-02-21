import type { AppConfig } from './config'
import type { SystemDiagnostics, UpdateInfo, DownloadProgress, UpdateResult } from './ipc'

/** Shape of the electronAPI object exposed via contextBridge.exposeInMainWorld */
export interface ElectronAPI {
  config: {
    load: () => Promise<AppConfig>
    save: (config: Partial<AppConfig>) => void
  }
  app: {
    reset: () => void
    restart: () => void
    showResetConfirmation: () => Promise<boolean>
    getDiagnostics: () => Promise<SystemDiagnostics>
  }
  navigation: {
    loadURL: (url: string) => void
    updateDashboardState: (isDashboardPage: boolean) => void
  }
  ui: {
    toggleAll: () => Promise<void>
    togglePageElements: () => Promise<void>
    toggleNavOnly: () => Promise<void>
    toggleHeaderOnly: () => Promise<void>
    toggleWidgetPanel: () => void
    returnToDashboard: () => void
  }
  updates: {
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
    onUpdateError: (callback: (message: string) => void) => void
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void
    checkForUpdates: () => Promise<UpdateResult>
    downloadUpdate: () => Promise<UpdateResult>
    installUpdate: () => Promise<void>
  }
  timeouts: {
    setTrackedTimeout: (purpose: string, callback: () => void, duration: number) => number
    clearTimeout: (purpose: string) => void
    clearAllTimeouts: () => void
  }
  reset: () => void
  restart: () => void
  getAppVersion: () => Promise<string>
}

/** Augment Window to include the electronAPI */
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
