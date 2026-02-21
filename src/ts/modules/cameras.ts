/**
 * Camera detection, zoom dispatch, and hotkey listener for dashboard liveviews.
 *
 * Renderer-side module. Communicates camera list and zoom state to the main
 * process so the Cameras menu stays in sync.
 */

import { log, logError } from './utils'
import { ZOOM_WAIT_TIMEOUT_MS } from './constants'
import type { CameraInfo } from '../types/cameras'

const { ipcRenderer } = require('electron') as typeof import('electron')

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
 */
export function detectCameras(): CameraInfo[] {
  const tiles = document.querySelectorAll('[data-viewport]')
  const cameras: CameraInfo[] = []

  tiles.forEach((tile) => {
    const index = parseInt(tile.getAttribute('data-viewport')!, 10)
    if (isNaN(index)) return

    const nameEl = tile.querySelector('[class*=CameraName]')
    const name = nameEl ? nameEl.textContent!.trim() : `Camera ${index + 1}`
    cameras.push({ index, name })
  })

  cameras.sort((a, b) => a.index - b.index)

  const zoomSupported = true
  ipcRenderer.send('update-camera-list', { cameras, zoomSupported })
  ipcRenderer.send('update-camera-zoom', -1)

  log(`Detected ${cameras.length} cameras, zoom supported: ${zoomSupported}`)
  return cameras
}

/**
 * Dispatch a synthetic click on a tile's overlay to trigger Protect's zoom/unzoom.
 */
function clickTileOverlay(index: number): boolean {
  const tile = document.querySelector(`[data-viewport="${index}"]`)
  if (!tile) {
    logError(`Camera tile with viewport index ${index} not found`)
    return false
  }

  const overlay = tile.querySelector('[class*=ClickCaptureOverlay__Root]')
  if (!overlay) {
    logError(`Click overlay not found for viewport ${index}`)
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
function disableZoomTransitions(): void {
  if (document.getElementById(FAST_ZOOM_ID)) return
  const style = document.createElement('style')
  style.id = FAST_ZOOM_ID
  style.textContent = FAST_ZOOM_CSS
  document.head.appendChild(style)
}

/**
 * Remove the fast-zoom CSS override, restoring normal transitions.
 */
function enableZoomTransitions(): void {
  const style = document.getElementById(FAST_ZOOM_ID)
  if (style) style.remove()
}

/**
 * Poll until React's zoom state matches the expected value, or timeout.
 * Uses requestAnimationFrame for efficient, frame-aligned checks.
 */
function waitForZoomState(expected: number): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + ZOOM_WAIT_TIMEOUT_MS
    function check(): void {
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
 */
function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = n
    function tick(): void {
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
 */
export async function zoomToCamera(index: number): Promise<void> {
  const currentZoom = getCurrentZoomIndex()
  disableZoomTransitions()

  try {
    if (currentZoom === index) {
      clickTileOverlay(index)
      await waitForZoomState(-1)
      await waitFrames(2)
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
      return
    }

    if (currentZoom >= 0) {
      clickTileOverlay(currentZoom)
      await waitForZoomState(-1)
      clickTileOverlay(index)
      await waitForZoomState(index)
      await waitFrames(2)
      ipcRenderer.send('update-camera-zoom', getCurrentZoomIndex())
      return
    }

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
export async function unzoomAll(): Promise<void> {
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
 * Injects a <script> to bridge the context isolation boundary.
 */
export function getCurrentZoomIndex(): number {
  const resultId = '__upv_zoom_result'

  const stale = document.getElementById(resultId)
  if (stale) stale.remove()

  const resultEl = document.createElement('div')
  resultEl.id = resultId
  resultEl.style.display = 'none'
  document.body.appendChild(resultEl)

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

  const zoom = parseInt(resultEl.dataset.zoom || '-1', 10)

  resultEl.remove()
  script.remove()

  return zoom
}

/**
 * Set up keyboard listener for bare number keys (1-9, 0) to zoom cameras.
 * Only active on dashboard pages, ignored when focus is in an input.
 */
export function setupHotkeyListener(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const dashboard = require('./dashboard') as typeof import('./dashboard')
    if (!dashboard.isDashboardPage()) return

    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

    if (e.key === '0') {
      e.preventDefault()
      unzoomAll()
      return
    }

    if (e.key >= '1' && e.key <= '9') {
      const index = Number(e.key) - 1
      if (document.querySelector(`[data-viewport="${index}"]`)) {
        e.preventDefault()
        zoomToCamera(index)
      }
    }
  })
}
