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

const VISUAL_ROW_TOLERANCE_PX = 20
const LAYOUT_DEBOUNCE_MS = 750

/**
 * Return the actual `data-viewport` indices of the current dashboard tiles,
 * sorted in visual reading order (top-to-bottom, then left-to-right).
 *
 * Protect v7 custom liveviews let users reorder tiles without renumbering the
 * underlying `data-viewport` attribute, so raw numeric order no longer matches
 * the visible layout. This function is the bridge between "the tile at visual
 * position N" (what hotkeys and the Cameras menu want) and Protect's internal
 * viewport index (what the zoom dispatch and React fiber state use).
 */
export function getVisualTileOrder(): number[] {
  const tiles = Array.from(document.querySelectorAll('[data-viewport]')) as HTMLElement[]
  return tiles
    .map((tile) => ({
      idx: parseInt(tile.getAttribute('data-viewport')!, 10),
      rect: tile.getBoundingClientRect(),
    }))
    .filter((t) => !isNaN(t.idx))
    .sort((a, b) => {
      if (Math.abs(a.rect.top - b.rect.top) > VISUAL_ROW_TOLERANCE_PX) return a.rect.top - b.rect.top
      return a.rect.left - b.rect.left
    })
    .map((t) => t.idx)
}

/**
 * Detect cameras on the current dashboard liveview.
 * Sends the camera list and zoom-support flag to the main process.
 * Cameras are ordered by visual position so the menu and hotkeys match the
 * on-screen layout regardless of Protect's internal viewport numbering.
 */
export function detectCameras(): CameraInfo[] {
  const visualOrder = getVisualTileOrder()
  const cameras: CameraInfo[] = []

  visualOrder.forEach((index) => {
    const tile = document.querySelector(`[data-viewport="${index}"]`)
    if (!tile) return
    const nameEl = tile.querySelector('[class*=CameraName]')
    const name = nameEl ? nameEl.textContent!.trim() : `Camera ${index + 1}`
    cameras.push({ index, name })
  })

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
 * Watch the liveview container for tile layout changes (re-arrangement, add/remove)
 * and re-run detectCameras() when the visual order actually changes.
 *
 * Protect's edit mode mutates tile positions and `data-viewport` attributes as the
 * user drags and saves. A debounced MutationObserver + snapshot diff keeps the
 * Cameras menu in sync without spamming IPC during the drag itself.
 */
let layoutObserver: MutationObserver | null = null
let layoutDebounceTimer: ReturnType<typeof setTimeout> | null = null
let lastLayoutSnapshot = ''

export function watchLayoutChanges(): void {
  // Protect v7 uses react-grid-layout; tiles are absolutely positioned inside
  // `customGrid__StyledReactGridLayout`, with position encoded as inline
  // `transform: translate(...)` on each tile. Watching style-attribute changes
  // on descendants captures drag, save, and auto-arrange equally well.
  const container = document.querySelector('[class*=customGrid__StyledReactGridLayout]')
  if (!container) return

  if (layoutObserver) layoutObserver.disconnect()
  lastLayoutSnapshot = getVisualTileOrder().join(',')

  layoutObserver = new MutationObserver(() => {
    if (layoutDebounceTimer) clearTimeout(layoutDebounceTimer)
    layoutDebounceTimer = setTimeout(() => {
      const snapshot = getVisualTileOrder().join(',')
      if (snapshot === lastLayoutSnapshot) return
      lastLayoutSnapshot = snapshot
      detectCameras()
    }, LAYOUT_DEBOUNCE_MS)
  })

  layoutObserver.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'data-viewport'],
  })
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
      const position = Number(e.key) - 1
      const viewportIdx = getVisualTileOrder()[position]
      if (viewportIdx !== undefined) {
        e.preventDefault()
        zoomToCamera(viewportIdx)
      }
    }
  })
}
