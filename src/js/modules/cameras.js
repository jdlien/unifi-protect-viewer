/**
 * Camera detection, zoom dispatch, and hotkey listener for dashboard liveviews.
 *
 * Renderer-side module. Communicates camera list and zoom state to the main
 * process so the Cameras menu stays in sync.
 */

const { ipcRenderer } = require('electron')
const utils = require('./utils.js')
const { ZOOM_WAIT_TIMEOUT_MS } = require('./constants')

const FAST_ZOOM_ID = 'upv-fast-zoom'
const FAST_ZOOM_CSS = `
[class*="ZoomableViewport"],
[class*="ViewportRemoveOnceFirefox"],
[class*="SizeTransitionWrapper"] {
  transition-duration: 45ms !important;
}
`

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

  // Navigating to a new view always resets Protect's zoom state
  const zoomSupported = true
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
 * Inject CSS that speeds up zoom transitions (~10x faster than default).
 */
function disableZoomTransitions() {
  if (document.getElementById(FAST_ZOOM_ID)) return
  const style = document.createElement('style')
  style.id = FAST_ZOOM_ID
  style.textContent = FAST_ZOOM_CSS
  document.head.appendChild(style)
}

/**
 * Remove the fast-zoom CSS override, restoring normal transitions.
 */
function enableZoomTransitions() {
  const style = document.getElementById(FAST_ZOOM_ID)
  if (style) style.remove()
}

/**
 * Poll until React's zoom state matches the expected value, or timeout.
 * Uses requestAnimationFrame for efficient, frame-aligned checks.
 * @param {number} expected - The expected zoomedSlotIdx (-1 for unzoomed)
 * @returns {Promise<void>}
 */
function waitForZoomState(expected) {
  return new Promise((resolve) => {
    const deadline = Date.now() + ZOOM_WAIT_TIMEOUT_MS
    function check() {
      if (getCurrentZoomIndex() === expected || Date.now() > deadline) {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}

/**
 * Wait N animation frames for the browser to paint.
 * @param {number} n - Number of frames to wait
 * @returns {Promise<void>}
 */
function waitFrames(n) {
  return new Promise((resolve) => {
    let remaining = n
    function tick() {
      if (--remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Zoom into a specific camera tile. If already zoomed into a different camera,
 * unzooms first, waits for React to confirm, then zooms to the target.
 * If already zoomed into the same camera, toggles back to grid.
 * Disables CSS transitions during programmatic zoom for instant switching.
 * @param {number} index - The viewport index (0-based)
 */
async function zoomToCamera(index) {
  const currentZoom = getCurrentZoomIndex()
  disableZoomTransitions()

  try {
    if (currentZoom === index) {
      // Toggle off — click the same tile to unzoom
      clickTileOverlay(index)
      await waitForZoomState(-1)
      await waitFrames(2)
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
      return
    }

    if (currentZoom >= 0) {
      // Switching cameras — unzoom current, then zoom target
      clickTileOverlay(currentZoom)
      await waitForZoomState(-1)
      clickTileOverlay(index)
      await waitForZoomState(index)
      await waitFrames(2)
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
      return
    }

    // Not zoomed — zoom directly
    clickTileOverlay(index)
    await waitForZoomState(index)
    await waitFrames(2)
    ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
  } finally {
    enableZoomTransitions()
  }
}

/**
 * Unzoom back to the grid view by clicking the currently-zoomed tile.
 * Disables CSS transitions for instant unzoom.
 */
async function unzoomAll() {
  const currentIndex = getCurrentZoomIndex()
  if (currentIndex >= 0) {
    disableZoomTransitions()
    try {
      clickTileOverlay(currentIndex)
      await waitForZoomState(-1)
      await waitFrames(2)
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
    } finally {
      enableZoomTransitions()
    }
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
