/**
 * Updates module — renderer process only.
 *
 * Handles update notification DOM elements, CSS injection, and progress bar.
 * Imported by preload.js.
 */

const utils = require('./utils')

/**
 * Initialize update listeners in the renderer process
 */
function initializeUpdateListeners() {
  if (typeof window === 'undefined' || !window.electronAPI?.updates) {
    utils.log('Update API not available in renderer')
    return
  }

  utils.log('Initializing update listeners in renderer')

  // Handle update available notification (from main process)
  window.electronAPI.updates.onUpdateAvailable((info) => {
    utils.log('Renderer received: update-available', info.version)
    // Show non-modal notification, clicking downloads
    showUpdateNotification(
      `Update Available: v${info.version}`,
      'A new version is available. Click to download.',
      async () => {
        utils.log('Renderer requesting download via notification click')
        removeUpdateNotification() // Hide notification once clicked
        const result = await window.electronAPI.updates.downloadUpdate()
        if (!result.success) {
          // Handle potential error during download initiation
          showUpdateNotification(
            'Download Error',
            `Failed to start download: ${result.message}`,
            removeUpdateNotification,
          )
        } else {
          // Show progress bar in notification area now
          showUpdateNotification(`Downloading v${info.version}`, 'Preparing download...', removeUpdateNotification) // Placeholder message
          updateDownloadProgress(0) // Show progress bar immediately
        }
      },
    )
  })

  // Handle update errors (from main process)
  window.electronAPI.updates.onUpdateError((message) => {
    utils.logError('Renderer received: update-error', message)
    // Optionally show an error notification/toast here, but the main process shows a dialog
    showUpdateNotification('Update Error', message, removeUpdateNotification)
  })

  // Handle download progress (from main process)
  window.electronAPI.updates.onDownloadProgress((progress) => {
    // Update the non-modal notification progress bar
    updateDownloadProgress(Math.floor(progress.percent || 0))
  })

  // Handle update downloaded (from main process)
  window.electronAPI.updates.onUpdateDownloaded((info) => {
    utils.log('Renderer received: update-downloaded', info.version)
    // Show non-modal notification, clicking installs
    showUpdateNotification(`Update Ready: v${info.version}`, 'Update downloaded. Click to install and restart.', () => {
      utils.log('Renderer requesting install via notification click')
      removeUpdateNotification() // Hide notification
      window.electronAPI.updates.installUpdate() // No need to await, app will quit
    })
  })
}

/**
 * Show an update notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Function} onClick - Click handler
 */
function showUpdateNotification(title, message, onClick) {
  if (typeof document === 'undefined') return

  // Remove any existing notification
  removeUpdateNotification()

  // Create notification element
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

  // Add click handler
  notification.addEventListener('click', onClick)

  // Add close button
  const closeButton = document.createElement('button')
  closeButton.className = 'update-notification-close'
  closeButton.innerHTML = '×'
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation() // Prevent notification click
    removeUpdateNotification()
  })
  notification.appendChild(closeButton)

  // Add to DOM
  document.body.appendChild(notification)

  // Add styles if not already added
  addUpdateStyles()
}

/**
 * Update the download progress bar
 * @param {number} percent - Download percentage
 */
function updateDownloadProgress(percent) {
  if (typeof document === 'undefined') return

  const progressBar = document.getElementById('update-progress-bar')
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
function removeUpdateNotification() {
  if (typeof document === 'undefined') return

  const notification = document.getElementById('update-notification')
  if (notification) {
    notification.remove()
  }
}

/**
 * Add update notification styles to the document
 */
function addUpdateStyles() {
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

module.exports = {
  initializeUpdateListeners,
  showUpdateNotification,
  removeUpdateNotification,
  updateDownloadProgress,
}
