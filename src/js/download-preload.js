const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, data) => callback(data))
  },
})
