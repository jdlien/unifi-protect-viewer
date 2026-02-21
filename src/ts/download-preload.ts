const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateProgress: (callback: (data: unknown) => void) => {
    ipcRenderer.on('update-progress', (_event: unknown, data: unknown) => callback(data))
  },
})
