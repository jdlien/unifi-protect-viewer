/**
 * Updates module — renderer process only.
 *
 * Handles update notification DOM elements, CSS injection, and progress bar.
 * Imported by preload.ts.
 */

import { log, logError } from './utils'

/**
 * Initialize update listeners in the renderer process
 */
export function initializeUpdateListeners(): void {
  if (typeof window === 'undefined' || !window.electronAPI?.updates) {
    log('Update API not available in renderer')
    return
  }

  log('Initializing update listeners in renderer')

  window.electronAPI.updates.onUpdateAvailable((info) => {
    log('Renderer received: update-available', info.version)
    showUpdateNotification(
      `Update Available: v${info.version}`,
      'A new version is available. Click to download.',
      async () => {
        log('Renderer requesting download via notification click')
        removeUpdateNotification()
        const result = await window.electronAPI.updates.downloadUpdate()
        if (!result.success) {
          showUpdateNotification(
            'Download Error',
            `Failed to start download: ${result.message}`,
            removeUpdateNotification,
          )
        } else {
          showUpdateNotification(`Downloading v${info.version}`, 'Preparing download...', removeUpdateNotification)
          updateDownloadProgress(0)
        }
      },
    )
  })

  window.electronAPI.updates.onUpdateError((message) => {
    logError('Renderer received: update-error', message)
    showUpdateNotification('Update Error', message, removeUpdateNotification)
  })

  window.electronAPI.updates.onDownloadProgress((progress) => {
    updateDownloadProgress(Math.floor(progress.percent || 0))
  })

  window.electronAPI.updates.onUpdateDownloaded((info) => {
    log('Renderer received: update-downloaded', info.version)
    showUpdateNotification(`Update Ready: v${info.version}`, 'Update downloaded. Click to install and restart.', () => {
      log('Renderer requesting install via notification click')
      removeUpdateNotification()
      window.electronAPI.updates.installUpdate()
    })
  })
}

/**
 * Show an update notification
 */
export function showUpdateNotification(title: string, message: string, onClick: () => void): void {
  if (typeof document === 'undefined') return

  removeUpdateNotification()

  const notification = document.createElement('div')
  notification.id = 'update-notification'
  notification.className = 'update-notification'
  notification.innerHTML = `
    <div class="update-notification-content">
      <h3>${title}</h3>
      <p>${message}</p>
      <div id="update-progress" class="update-progress" style="display: none;">
        <div id="update-progress-bar" class="update-progress-bar"></div>
        <div id="update-progress-text" class="update-progress-text">0%</div>
      </div>
    </div>
  `

  notification.addEventListener('click', onClick)

  const closeButton = document.createElement('button')
  closeButton.className = 'update-notification-close'
  closeButton.innerHTML = '&times;'
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation()
    removeUpdateNotification()
  })
  notification.appendChild(closeButton)

  document.body.appendChild(notification)

  addUpdateStyles()
}

/**
 * Update the download progress bar
 */
export function updateDownloadProgress(percent: number): void {
  if (typeof document === 'undefined') return

  const progressBar = document.getElementById('update-progress-bar') as HTMLElement | null
  const progressText = document.getElementById('update-progress-text')
  const progressContainer = document.getElementById('update-progress')

  if (progressContainer && progressBar && progressText) {
    progressContainer.style.display = 'block'
    progressBar.style.width = `${percent}%`
    progressText.textContent = `${percent}%`
  }
}

/**
 * Remove update notification
 */
export function removeUpdateNotification(): void {
  if (typeof document === 'undefined') return

  const notification = document.getElementById('update-notification')
  if (notification) {
    notification.remove()
  }
}

/**
 * Add update notification styles to the document
 */
function addUpdateStyles(): void {
  if (typeof document === 'undefined') return

  if (document.getElementById('update-notification-styles')) return

  const style = document.createElement('style')
  style.id = 'update-notification-styles'
  style.textContent = `
    .update-notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #2a2a2a;
      color: #f0f0f0;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 9999;
      max-width: 350px;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 1px solid #3a3a3a;
    }

    .update-notification:hover {
      background-color: #323232;
      transform: translateY(-3px);
    }

    .update-notification-content h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .update-notification-content p {
      margin: 0 0 10px 0;
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.4;
    }

    .update-notification-close {
      position: absolute;
      top: 8px;
      right: 10px;
      background: none;
      border: none;
      color: #a0a0a0;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }

    .update-notification-close:hover {
      color: #f0f0f0;
    }

    .update-progress {
      height: 6px;
      background: #444;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 10px;
      position: relative;
    }

    .update-progress-bar {
      height: 100%;
      background: #4c9eff;
      transition: width 0.3s ease;
      width: 0%;
    }

    .update-progress-text {
      position: absolute;
      right: 0;
      top: -18px;
      font-size: 12px;
      opacity: 0.8;
    }
  `

  document.head.appendChild(style)
}
