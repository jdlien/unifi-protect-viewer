import type { AppConfig } from './config'
import type { CameraInfo } from './cameras'

export interface SystemDiagnostics {
  hardwareAcceleration: boolean
  platform: string
  arch: string
  electronVersion: string
  chromeVersion: string
}

export interface UpdateInfo {
  version: string
  [key: string]: unknown
}

export interface DownloadProgress {
  percent: number
  [key: string]: unknown
}

export interface UpdateResult {
  success: boolean
  message?: string
}

/** Maps ipcRenderer.invoke channel names to their return types */
export interface IpcInvokeChannels {
  configLoad: AppConfig
  configSavePartial: boolean
  isFullScreen: boolean
  showResetConfirmation: boolean
  getSystemDiagnostics: SystemDiagnostics
  'updates:check-manual': UpdateResult
  'updates:download': UpdateResult
  'updates:install': void
  'get-app-version': string
}

/** Maps ipcRenderer.send channel names to their argument types */
export interface IpcSendChannels {
  configSave: [config: Partial<AppConfig>]
  loadURL: [url: string]
  restart: []
  reset: []
  toggleFullscreen: []
  'update-dashboard-state': [isDashboardPage: boolean]
  'update-ui-state': [uiState: Record<string, unknown>]
  'update-camera-list': [data: { cameras: CameraInfo[]; zoomSupported: boolean }]
  'update-camera-zoom': [index: number]
}

/** Maps ipcRenderer.on channel names to their callback argument types */
export interface IpcReceiveChannels {
  'fullscreen-change': [isFullscreen: boolean]
  'toggle-navigation': []
  'toggle-nav-only': []
  'toggle-header-only': []
  'return-to-dashboard': []
  'zoom-camera': [index: number]
  'toggle-widget-panel': []
  'update-available': [info: UpdateInfo]
  'update-error': [message: string]
  'download-progress': [progress: DownloadProgress]
  'update-downloaded': [info: UpdateInfo]
}
