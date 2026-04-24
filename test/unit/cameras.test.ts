import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import Module from 'module'
import path from 'path'

// ---------------------------------------------------------------------------
// CJS require() interception
// ---------------------------------------------------------------------------
// cameras.ts uses `require('electron')` at module top level and
// `require('./dashboard')` lazily inside setupHotkeyListener. These are CJS
// require calls that bypass Vite's ESM transform, so vi.mock() cannot
// intercept them. We use Module._resolveFilename to redirect them.

const mockDashboard = {
  isDashboardPage: vi.fn().mockReturnValue(true),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalResolveFilename = (Module as any)._resolveFilename
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  // Intercept require('electron')
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }

  // Intercept lazy require('./dashboard') from cameras.ts
  if (request === './dashboard' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__dashboard__'
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Register mock dashboard in Node's require cache
// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__dashboard__'] = {
  id: '__mock__dashboard__',
  filename: '__mock__dashboard__',
  loaded: true,
  exports: mockDashboard,
} as unknown as NodeModule

// Mock utils to suppress log output during tests
vi.mock('../../src/ts/modules/utils', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cameras: any

/** Get the mocked ipcRenderer from the intercepted electron module. */
function getMockIpcSend(): Mock {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron')
  return electron.ipcRenderer.send
}

/**
 * Build a camera tile DOM structure that mirrors Protect's real layout:
 *   <div data-viewport="N">
 *     <div class="CameraName__xxx">Camera Name</div>
 *     <div class="ClickCaptureOverlay__Root__xxx"></div>
 *   </div>
 */
function createCameraTile(index: number, name: string, position?: { top: number; left: number }): HTMLElement {
  const tile = document.createElement('div')
  tile.setAttribute('data-viewport', String(index))

  // Give the tile a getBoundingClientRect so getVisualTileOrder can sort it.
  // Default (0,0) means "unspecified" — stable sort preserves DOM insertion order.
  const top = position?.top ?? 0
  const left = position?.left ?? 0
  tile.getBoundingClientRect = () => ({
    top,
    left,
    width: 200,
    height: 150,
    bottom: top + 150,
    right: left + 200,
    x: left,
    y: top,
    toJSON: () => {},
  })

  const nameEl = document.createElement('div')
  nameEl.className = `CameraName__abc${index}`
  nameEl.textContent = name
  tile.appendChild(nameEl)

  const overlay = document.createElement('div')
  overlay.className = `ClickCaptureOverlay__Root__xyz${index}`
  // getBoundingClientRect needs to return real-ish values for click dispatch
  overlay.getBoundingClientRect = () => ({
    top: 100,
    left: 100,
    width: 200,
    height: 150,
    bottom: 250,
    right: 300,
    x: 100,
    y: 100,
    toJSON: () => {},
  })
  tile.appendChild(overlay)

  return tile
}

/**
 * Set up a simple dashboard DOM with N camera tiles.
 */
function setupDashboardDOM(count: number, names?: string[]): void {
  const container = document.createElement('div')
  for (let i = 0; i < count; i++) {
    const name = names?.[i] ?? `Camera ${i + 1}`
    container.appendChild(createCameraTile(i, name))
  }
  document.body.appendChild(container)
}

/**
 * Mock requestAnimationFrame so that async functions using waitForZoomState
 * and waitFrames resolve promptly. The mock calls the callback synchronously
 * up to maxCalls times, then stops calling to prevent infinite recursion.
 *
 * Additionally, we advance Date.now past the ZOOM_WAIT_TIMEOUT_MS deadline
 * after the first few callbacks so waitForZoomState hits its timeout path
 * (since getCurrentZoomIndex always returns -1 in happy-dom).
 */
function mockRAFWithTimeout(): void {
  const realDateNow = Date.now
  let callCount = 0
  // After a few frames, jump forward in time to trip the timeout check
  vi.spyOn(Date, 'now').mockImplementation(() => {
    if (callCount > 3) {
      return realDateNow() + 10000 // well past the 2000ms ZOOM_WAIT_TIMEOUT_MS
    }
    return realDateNow()
  })

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    callCount++
    if (callCount < 50) {
      cb(performance.now())
    }
    return callCount
  })
}

describe('cameras', () => {
  let mockIpcSend: Mock

  beforeEach(async () => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''

    // Dynamic import so the module goes through Vite's ESM transform.
    // The Module._resolveFilename patch above ensures require('electron')
    // inside cameras.ts returns our mock.
    if (!cameras) {
      cameras = await import('../../src/ts/modules/cameras')
    }

    mockIpcSend = getMockIpcSend()
    vi.clearAllMocks()
    mockDashboard.isDashboardPage.mockReturnValue(true)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // detectCameras
  // ---------------------------------------------------------------------------
  describe('detectCameras', () => {
    it('returns an empty array when no camera tiles exist', () => {
      const result = cameras.detectCameras()

      expect(result).toEqual([])
      expect(mockIpcSend).toHaveBeenCalledWith('update-camera-list', {
        cameras: [],
        zoomSupported: true,
      })
    })

    it('detects cameras from [data-viewport] tiles', () => {
      setupDashboardDOM(3)

      const result = cameras.detectCameras()

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ index: 0, name: 'Camera 1' })
      expect(result[1]).toEqual({ index: 1, name: 'Camera 2' })
      expect(result[2]).toEqual({ index: 2, name: 'Camera 3' })
    })

    it('extracts camera names from [class*=CameraName] child elements', () => {
      setupDashboardDOM(2, ['Front Porch', 'Back Yard'])

      const result = cameras.detectCameras()

      expect(result[0].name).toBe('Front Porch')
      expect(result[1].name).toBe('Back Yard')
    })

    it('uses fallback name when CameraName element is missing', () => {
      const tile = document.createElement('div')
      tile.setAttribute('data-viewport', '0')
      document.body.appendChild(tile)

      const result = cameras.detectCameras()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Camera 1')
    })

    it('skips tiles with non-numeric viewport attributes', () => {
      const badTile = document.createElement('div')
      badTile.setAttribute('data-viewport', 'abc')
      document.body.appendChild(badTile)

      setupDashboardDOM(1)

      const result = cameras.detectCameras()

      expect(result).toHaveLength(1)
      expect(result[0].index).toBe(0)
    })

    it('sorts cameras by visual position, not by data-viewport index', () => {
      // Protect v7 scenario: data-viewport numbers do not match visual layout.
      // Layout (visual left-to-right, top-to-bottom):
      //   row 1:  vp=5 "Front",  vp=2 "Side"
      //   row 2:  vp=8 "Back",   vp=0 "Yard"
      document.body.appendChild(createCameraTile(8, 'Back', { top: 200, left: 0 }))
      document.body.appendChild(createCameraTile(5, 'Front', { top: 0, left: 0 }))
      document.body.appendChild(createCameraTile(0, 'Yard', { top: 200, left: 250 }))
      document.body.appendChild(createCameraTile(2, 'Side', { top: 0, left: 250 }))

      const result = cameras.detectCameras()

      expect(result.map((c: { index: number; name: string }) => c.name)).toEqual(['Front', 'Side', 'Back', 'Yard'])
      // data-viewport numbers preserved (needed for click dispatch + zoom state matching)
      expect(result.map((c: { index: number }) => c.index)).toEqual([5, 2, 8, 0])
    })

    it('treats tiles within VISUAL_ROW_TOLERANCE_PX as the same row', () => {
      // Two tiles ~15px apart vertically should still sort left-to-right.
      document.body.appendChild(createCameraTile(1, 'Right', { top: 10, left: 300 }))
      document.body.appendChild(createCameraTile(0, 'Left', { top: 0, left: 0 }))

      const result = cameras.detectCameras()

      expect(result.map((c: { name: string }) => c.name)).toEqual(['Left', 'Right'])
    })

    it('sends camera list to main process via IPC', () => {
      setupDashboardDOM(2, ['Front', 'Back'])

      cameras.detectCameras()

      expect(mockIpcSend).toHaveBeenCalledWith('update-camera-list', {
        cameras: [
          { index: 0, name: 'Front' },
          { index: 1, name: 'Back' },
        ],
        zoomSupported: true,
      })
    })

    it('resets zoom state to -1 via IPC', () => {
      setupDashboardDOM(1)

      cameras.detectCameras()

      expect(mockIpcSend).toHaveBeenCalledWith('update-camera-zoom', -1)
    })

    it('trims whitespace from camera names', () => {
      const tile = document.createElement('div')
      tile.setAttribute('data-viewport', '0')
      const nameEl = document.createElement('div')
      nameEl.className = 'CameraName__test'
      nameEl.textContent = '  Garage  '
      tile.appendChild(nameEl)
      document.body.appendChild(tile)

      const result = cameras.detectCameras()

      expect(result[0].name).toBe('Garage')
    })
  })

  // ---------------------------------------------------------------------------
  // watchLayoutChanges
  // ---------------------------------------------------------------------------
  describe('watchLayoutChanges', () => {
    function setupLiveviewContainer(tiles: HTMLElement[]): HTMLElement {
      const container = document.createElement('div')
      container.className = 'customGrid__StyledReactGridLayout-sc-142pcju-1 abc123'
      tiles.forEach((tile) => container.appendChild(tile))
      document.body.appendChild(container)
      return container
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('no-ops when the liveview container is absent', () => {
      expect(() => cameras.watchLayoutChanges()).not.toThrow()
    })

    it('re-runs detectCameras after tile rearrangement, debounced', async () => {
      const tileA = createCameraTile(0, 'Left', { top: 0, left: 0 })
      const tileB = createCameraTile(1, 'Right', { top: 0, left: 250 })
      setupLiveviewContainer([tileA, tileB])

      cameras.watchLayoutChanges()
      vi.clearAllMocks() // ignore the snapshot init

      // Simulate Protect swapping the tile positions
      tileA.getBoundingClientRect = () =>
        ({
          top: 0,
          left: 250,
          width: 200,
          height: 150,
          bottom: 150,
          right: 450,
          x: 250,
          y: 0,
          toJSON: () => {},
        }) as DOMRect
      tileB.getBoundingClientRect = () =>
        ({ top: 0, left: 0, width: 200, height: 150, bottom: 150, right: 200, x: 0, y: 0, toJSON: () => {} }) as DOMRect
      tileA.setAttribute('style', 'transform: translateX(250px)')

      await vi.advanceTimersByTimeAsync(800)

      const camListCall = mockIpcSend.mock.calls.find((c) => c[0] === 'update-camera-list')
      expect(camListCall).toBeDefined()
      expect(camListCall![1].cameras.map((c: { name: string }) => c.name)).toEqual(['Right', 'Left'])
    })

    it('does not re-send IPC when mutations leave visual order unchanged', async () => {
      const tileA = createCameraTile(0, 'Left', { top: 0, left: 0 })
      const tileB = createCameraTile(1, 'Right', { top: 0, left: 250 })
      setupLiveviewContainer([tileA, tileB])

      cameras.watchLayoutChanges()
      vi.clearAllMocks()

      // Cosmetic attribute change, no position change
      tileA.setAttribute('style', 'background: red')

      await vi.advanceTimersByTimeAsync(800)

      const camListCalls = mockIpcSend.mock.calls.filter((c) => c[0] === 'update-camera-list')
      expect(camListCalls).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // getCurrentZoomIndex
  // ---------------------------------------------------------------------------
  describe('getCurrentZoomIndex', () => {
    it('returns -1 when no camera tiles exist', () => {
      const zoom = cameras.getCurrentZoomIndex()
      expect(zoom).toBe(-1)
    })

    it('returns -1 when tile exists but has no React fiber', () => {
      setupDashboardDOM(1)

      const zoom = cameras.getCurrentZoomIndex()
      expect(zoom).toBe(-1)
    })

    it('cleans up injected script and result elements', () => {
      setupDashboardDOM(1)

      cameras.getCurrentZoomIndex()

      expect(document.getElementById('__upv_zoom_result')).toBeNull()
    })

    it('removes stale result element from previous call', () => {
      const stale = document.createElement('div')
      stale.id = '__upv_zoom_result'
      document.body.appendChild(stale)

      setupDashboardDOM(1)
      cameras.getCurrentZoomIndex()

      const remaining = document.querySelectorAll('#__upv_zoom_result')
      expect(remaining).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // zoomToCamera
  // ---------------------------------------------------------------------------
  describe('zoomToCamera', () => {
    // In happy-dom, the injected <script> for React fiber reading won't execute,
    // so getCurrentZoomIndex always returns -1 (no zoom state). We test the click
    // dispatch and IPC communication paths. The rAF mock + Date.now advancement
    // ensures waitForZoomState hits its timeout and resolves promptly.

    beforeEach(() => {
      mockRAFWithTimeout()
    })

    it('dispatches click events on the tile overlay', async () => {
      setupDashboardDOM(3)
      const overlay = document.querySelector('[data-viewport="1"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      await cameras.zoomToCamera(1)

      expect(clickSpy).toHaveBeenCalled()
    })

    it('sends zoom state update via IPC after zooming', async () => {
      setupDashboardDOM(3)

      await cameras.zoomToCamera(1)

      expect(mockIpcSend).toHaveBeenCalledWith('update-camera-zoom', expect.any(Number))
    })

    it('removes fast-zoom CSS after zoom completes', async () => {
      setupDashboardDOM(2)

      await cameras.zoomToCamera(0)

      // The finally block calls enableZoomTransitions which removes the style
      expect(document.getElementById('upv-fast-zoom')).toBeNull()
    })

    it('removes fast-zoom CSS even when tile overlay is missing', async () => {
      // Tile exists but has no overlay — clickTileOverlay returns false
      const tile = document.createElement('div')
      tile.setAttribute('data-viewport', '0')
      document.body.appendChild(tile)

      await cameras.zoomToCamera(0)

      expect(document.getElementById('upv-fast-zoom')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // unzoomAll
  // ---------------------------------------------------------------------------
  describe('unzoomAll', () => {
    beforeEach(() => {
      mockRAFWithTimeout()
    })

    it('does nothing when not zoomed (getCurrentZoomIndex returns -1)', async () => {
      setupDashboardDOM(2)

      await cameras.unzoomAll()

      // No IPC zoom update should be sent since we were not zoomed
      expect(mockIpcSend).not.toHaveBeenCalledWith('update-camera-zoom', expect.anything())
    })
  })

  // ---------------------------------------------------------------------------
  // setupHotkeyListener
  // ---------------------------------------------------------------------------
  describe('setupHotkeyListener', () => {
    beforeEach(() => {
      mockDashboard.isDashboardPage.mockReturnValue(true)
      mockRAFWithTimeout()
    })

    it('registers a keydown listener on document', () => {
      const spy = vi.spyOn(document, 'addEventListener')

      cameras.setupHotkeyListener()

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })

    it('zooms to camera on number key 1-9', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }))

      // Key '1' maps to index 0, so the overlay on viewport 0 should get clicked
      expect(clickSpy).toHaveBeenCalled()
    })

    it('number key maps to visual position, not to raw data-viewport value', () => {
      // v7 scenario: pressing "1" should zoom into the visually-first tile
      // even if its data-viewport is not 0.
      document.body.appendChild(createCameraTile(7, 'top-left', { top: 0, left: 0 }))
      document.body.appendChild(createCameraTile(3, 'top-right', { top: 0, left: 250 }))
      cameras.setupHotkeyListener()

      const topLeftOverlay = document.querySelector('[data-viewport="7"] [class*=ClickCaptureOverlay__Root]')!
      const topRightOverlay = document.querySelector('[data-viewport="3"] [class*=ClickCaptureOverlay__Root]')!
      const topLeftClick = vi.fn()
      const topRightClick = vi.fn()
      topLeftOverlay.addEventListener('click', topLeftClick)
      topRightOverlay.addEventListener('click', topRightClick)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }))

      expect(topLeftClick).toHaveBeenCalled()
      expect(topRightClick).not.toHaveBeenCalled()
    })

    it('ignores number keys beyond the camera count (no preventDefault)', () => {
      // Only 2 cameras present; pressing "5" should do nothing and NOT swallow the event
      setupDashboardDOM(2)
      cameras.setupHotkeyListener()

      const event = new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true })
      const preventDefault = vi.spyOn(event, 'preventDefault')

      document.dispatchEvent(event)

      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('ignores number keys when not on a dashboard page', () => {
      mockDashboard.isDashboardPage.mockReturnValue(false)
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }))

      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('ignores number keys when focus is on an input element', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      // Override activeElement since happy-dom may not track focus properly
      Object.defineProperty(document, 'activeElement', {
        get: () => input,
        configurable: true,
      })

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }))

      expect(clickSpy).not.toHaveBeenCalled()

      // Restore
      Object.defineProperty(document, 'activeElement', {
        get: () => document.body,
        configurable: true,
      })
    })

    it('ignores number keys when focus is on a textarea', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)

      Object.defineProperty(document, 'activeElement', {
        get: () => textarea,
        configurable: true,
      })

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }))

      expect(clickSpy).not.toHaveBeenCalled()

      Object.defineProperty(document, 'activeElement', {
        get: () => document.body,
        configurable: true,
      })
    })

    it('ignores keys with ctrl modifier', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '1',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )

      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('ignores keys with meta modifier', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '1',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )

      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('ignores keys with alt modifier', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '1',
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )

      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('ignores keys with shift modifier', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const overlay = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay.addEventListener('click', clickSpy)

      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '1',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )

      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('ignores number keys for cameras that do not exist in the DOM', () => {
      setupDashboardDOM(2) // Only cameras at index 0 and 1
      cameras.setupHotkeyListener()

      const overlay0 = document.querySelector('[data-viewport="0"] [class*=ClickCaptureOverlay__Root]')!
      const clickSpy = vi.fn()
      overlay0.addEventListener('click', clickSpy)

      // Key '9' maps to index 8, which doesn't exist — no click dispatched
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true, cancelable: true }))

      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('calls unzoomAll on key 0 without error', () => {
      setupDashboardDOM(2)
      cameras.setupHotkeyListener()

      const event = new KeyboardEvent('keydown', {
        key: '0',
        bubbles: true,
        cancelable: true,
      })

      // unzoomAll is a no-op when getCurrentZoomIndex returns -1
      expect(() => document.dispatchEvent(event)).not.toThrow()
    })

    it('prevents default on recognized number key hotkeys', () => {
      setupDashboardDOM(3)
      cameras.setupHotkeyListener()

      const event = new KeyboardEvent('keydown', {
        key: '1',
        bubbles: true,
        cancelable: true,
      })
      const preventSpy = vi.spyOn(event, 'preventDefault')

      document.dispatchEvent(event)

      expect(preventSpy).toHaveBeenCalled()
    })

    it('prevents default on key 0', () => {
      setupDashboardDOM(1)
      cameras.setupHotkeyListener()

      const event = new KeyboardEvent('keydown', {
        key: '0',
        bubbles: true,
        cancelable: true,
      })
      const preventSpy = vi.spyOn(event, 'preventDefault')

      document.dispatchEvent(event)

      expect(preventSpy).toHaveBeenCalled()
    })

    it('does not prevent default on non-camera keys', () => {
      setupDashboardDOM(1)
      cameras.setupHotkeyListener()

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      })
      const preventSpy = vi.spyOn(event, 'preventDefault')

      document.dispatchEvent(event)

      expect(preventSpy).not.toHaveBeenCalled()
    })
  })
})
