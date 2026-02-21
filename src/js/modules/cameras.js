/**
 * Camera detection, zoom dispatch, and hotkey listener for dashboard liveviews.
 *
 * Renderer-side module. Communicates camera list and zoom state to the main
 * process so the Cameras menu stays in sync.
 */

const { ipcRenderer } = require('electron')
const utils = require('./utils.js')

/**
 * Detect cameras on the current dashboard liveview.
 * Sends the camera list and zoom-support flag to the main process.
 * @returns {Array<{index: number, name: string}>}
 */
function detectCameras() {
  const tiles = document.querySelectorAll('[data-viewport]')
  const cameras = []

  tiles.forEach((tile) => {
    const index = parseInt(tile.getAttribute('data-viewport'), 10)
    if (isNaN(index)) return

    const nameEl = tile.querySelector('[class*=CameraName]')
    const name = nameEl ? nameEl.textContent.trim() : `Camera ${index + 1}`
    cameras.push({ index, name })
  })

  // Sort by viewport index
  cameras.sort((a, b) => a.index - b.index)

  // /dashboard/all does not support zoom
  const zoomSupported = !window.location.href.includes('/dashboard/all')

  // Navigating to a new view always resets Protect's zoom state
  ipcRenderer.send('update-camera-list', { cameras, zoomSupported })
  ipcRenderer.send('update-camera-zoom', -1)

  utils.log(`Detected ${cameras.length} cameras, zoom supported: ${zoomSupported}`)
  return cameras
}

/**
 * Dispatch a synthetic click on a tile's overlay to trigger Protect's zoom/unzoom.
 * @param {number} index - The viewport index (0-based)
 */
function clickTileOverlay(index) {
  const tile = document.querySelector(`[data-viewport="${index}"]`)
  if (!tile) {
    utils.logError(`Camera tile with viewport index ${index} not found`)
    return false
  }

  const overlay = tile.querySelector('[class*=ClickCaptureOverlay__Root]')
  if (!overlay) {
    utils.logError(`Click overlay not found for viewport ${index}`)
    return false
  }

  const rect = overlay.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2

  const eventOpts = { bubbles: true, clientX: x, clientY: y, pointerId: 1 }
  overlay.dispatchEvent(new PointerEvent('pointerdown', eventOpts))
  overlay.dispatchEvent(new MouseEvent('mousedown', eventOpts))
  overlay.dispatchEvent(new PointerEvent('pointerup', eventOpts))
  overlay.dispatchEvent(new MouseEvent('mouseup', eventOpts))
  overlay.dispatchEvent(new MouseEvent('click', eventOpts))
  return true
}

/**
 * Zoom into a specific camera tile. If already zoomed into a different camera,
 * unzooms first, waits for animation, then zooms to the target.
 * If already zoomed into the same camera, toggles back to grid.
 * @param {number} index - The viewport index (0-based)
 */
function zoomToCamera(index) {
  const currentZoom = getCurrentZoomIndex()

  if (currentZoom === index) {
    // Toggle off — click the same tile to unzoom
    clickTileOverlay(index)
    setTimeout(() => {
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
    }, 500)
    return
  }

  if (currentZoom >= 0) {
    // Already zoomed to a different camera — unzoom first, then zoom to target
    clickTileOverlay(currentZoom)
    setTimeout(() => {
      clickTileOverlay(index)
      setTimeout(() => {
        ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
      }, 500)
    }, 600)
    return
  }

  // Not zoomed — zoom directly
  clickTileOverlay(index)
  setTimeout(() => {
    ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
  }, 500)
}

/**
 * Unzoom back to the grid view by clicking the currently-zoomed tile.
 */
function unzoomAll() {
  const currentIndex = getCurrentZoomIndex()
  if (currentIndex >= 0) {
    clickTileOverlay(currentIndex)
    setTimeout(() => {
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
    }, 500)
  }
}

/**
 * Read the current zoomed camera index from React's fiber tree.
 * Because contextIsolation is enabled, React's fiber keys (__reactFiber$*)
 * are only visible in the main world. We bridge the gap by injecting a
 * <script> that reads the fiber and writes the result to a data attribute.
 * @returns {number} The zoomed viewport index, or -1 if not zoomed.
 */
function getCurrentZoomIndex() {
  const resultId = '__upv_zoom_result'

  // Clean up any stale result element
  const stale = document.getElementById(resultId)
  if (stale) stale.remove()

  // Hidden element to receive the result from the main world
  const resultEl = document.createElement('div')
  resultEl.id = resultId
  resultEl.style.display = 'none'
  document.body.appendChild(resultEl)

  // Script runs in the main world where React fiber is accessible
  const script = document.createElement('script')
  script.textContent = `(function() {
    var result = document.getElementById('${resultId}');
    if (!result) return;
    var tile = document.querySelector('[data-viewport="0"]');
    if (!tile) { result.dataset.zoom = '-1'; return; }
    var fiberKey = Object.keys(tile).find(function(k) {
      return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
    });
    if (!fiberKey) { result.dataset.zoom = '-1'; return; }
    var fiber = tile[fiberKey];
    for (var i = 0; i < 30 && fiber; i++) {
      var props = fiber.memoizedProps;
      if (props && typeof props.zoomedSlotIdx === 'number') {
        result.dataset.zoom = String(props.zoomedSlotIdx);
        return;
      }
      fiber = fiber.return;
    }
    result.dataset.zoom = '-1';
  })()`
  document.body.appendChild(script)

  // Read the result (script executes synchronously)
  const zoom = parseInt(resultEl.dataset.zoom || '-1', 10)

  // Cleanup
  resultEl.remove()
  script.remove()

  return zoom
}

/**
 * Set up keyboard listener for bare number keys (1-9, 0) to zoom cameras.
 * Only active on dashboard pages, ignored when focus is in an input.
 */
function setupHotkeyListener() {
  document.addEventListener('keydown', (e) => {
    // Skip if not on a dashboard page
    const dashboard = require('./dashboard.js')
    if (!dashboard.isDashboardPage()) return

    // Skip on /dashboard/all (no zoom support)
    if (window.location.href.includes('/dashboard/all')) return

    // Skip if focus is in an input element
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // Skip if any modifier key is held
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

    if (e.key === '0') {
      e.preventDefault()
      unzoomAll()
      return
    }

    if (e.key >= '1' && e.key <= '9') {
      const index = Number(e.key) - 1
      // Only zoom if that viewport exists
      if (document.querySelector(`[data-viewport="${index}"]`)) {
        e.preventDefault()
        zoomToCamera(index)
      }
    }
  })
}

module.exports = {
  detectCameras,
  zoomToCamera,
  unzoomAll,
  getCurrentZoomIndex,
  setupHotkeyListener,
}
