import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Module from 'module'
import path from 'path'

// ---------------------------------------------------------------------------
// CJS require() interception
// ---------------------------------------------------------------------------
// dashboard.ts uses `require('electron')` at the top level and lazy
// `require('./ui')`, `require('./buttons')`, and `require('./cameras')`
// inside initializeDashboard. We intercept these CJS require calls.

const mockUi = {
  handleLiveView: vi.fn(),
}

const mockButtons = {
  handleDashboardButton: vi.fn().mockResolvedValue(undefined),
}

const mockCameras = {
  detectCameras: vi.fn(),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalResolveFilename = (Module as any)._resolveFilename
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }

  if (request === './ui' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__ui_dashboard__'
  }

  if (request === './buttons' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__buttons_dashboard__'
  }

  if (request === './cameras' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__cameras_dashboard__'
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Register sentinel paths in Node's require cache
// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__ui_dashboard__'] = {
  id: '__mock__ui_dashboard__',
  filename: '__mock__ui_dashboard__',
  loaded: true,
  exports: mockUi,
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__buttons_dashboard__'] = {
  id: '__mock__buttons_dashboard__',
  filename: '__mock__buttons_dashboard__',
  loaded: true,
  exports: mockButtons,
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__cameras_dashboard__'] = {
  id: '__mock__cameras_dashboard__',
  filename: '__mock__cameras_dashboard__',
  loaded: true,
  exports: mockCameras,
} as unknown as NodeModule

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMockIpcRenderer() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron')
  return electron.ipcRenderer
}

const originalLocation = window.location

function setLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: new URL(url),
  })
}

/** Create the DOM elements that dashboard.ts waits for. */
function createDashboardElements(): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'liveView__FullscreenWrapper'
  document.body.appendChild(wrapper)

  const content = document.createElement('div')
  content.className = 'dashboard__Content'
  document.body.appendChild(content)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dashboard: any

describe('dashboard', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
    setLocation('https://protect.local/protect/dashboard')

    const ipc = getMockIpcRenderer()
    ipc.invoke.mockReset()
    ipc.invoke.mockResolvedValue({})
    ipc.send.mockClear()

    mockUi.handleLiveView.mockReset()
    mockButtons.handleDashboardButton.mockReset()
    mockButtons.handleDashboardButton.mockResolvedValue(undefined)
    mockCameras.detectCameras.mockReset()

    if (!dashboard) {
      const mod = await import('../../src/ts/modules/dashboard')
      dashboard = mod
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    })
  })

  // ─── isDashboardPage ────────────────────────────────────────────────

  describe('isDashboardPage', () => {
    it('returns true when URL contains /protect/dashboard', () => {
      setLocation('https://protect.local/protect/dashboard')
      expect(dashboard.isDashboardPage()).toBe(true)
    })

    it('returns true when URL contains /protect/dashboard with trailing path', () => {
      setLocation('https://protect.local/protect/dashboard/some-subpage')
      expect(dashboard.isDashboardPage()).toBe(true)
    })

    it('returns false when URL does not contain /protect/dashboard', () => {
      setLocation('https://protect.local/protect/devices')
      expect(dashboard.isDashboardPage()).toBe(false)
    })

    it('returns false for login pages', () => {
      setLocation('https://protect.local/login')
      expect(dashboard.isDashboardPage()).toBe(false)
    })

    it('returns false for settings pages', () => {
      setLocation('https://protect.local/settings')
      expect(dashboard.isDashboardPage()).toBe(false)
    })
  })

  // ─── notifyDashboardState ──────────────────────────────────────────

  describe('notifyDashboardState', () => {
    it('sends update-dashboard-state with true when on dashboard page', () => {
      const ipc = getMockIpcRenderer()
      setLocation('https://protect.local/protect/dashboard')

      dashboard.notifyDashboardState()

      expect(ipc.send).toHaveBeenCalledWith('update-dashboard-state', true)
    })

    it('sends update-dashboard-state with false when not on dashboard page', () => {
      const ipc = getMockIpcRenderer()
      setLocation('https://protect.local/protect/devices')

      dashboard.notifyDashboardState()

      expect(ipc.send).toHaveBeenCalledWith('update-dashboard-state', false)
    })

    it('does not throw when ipcRenderer.send throws', () => {
      const ipc = getMockIpcRenderer()
      ipc.send.mockImplementation(() => {
        throw new Error('IPC error')
      })

      expect(() => dashboard.notifyDashboardState()).not.toThrow()
    })
  })

  // ─── waitForDashboardReady ─────────────────────────────────────────

  describe('waitForDashboardReady', () => {
    it('resolves to true when dashboard elements exist', async () => {
      createDashboardElements()

      const result = await dashboard.waitForDashboardReady()
      expect(result).toBe(true)
    })

    it('resolves to true when elements appear after a delay', async () => {
      // Elements don't exist yet, so waitUntil will poll
      const readyPromise = dashboard.waitForDashboardReady()

      // Add the elements after a short delay
      await vi.advanceTimersByTimeAsync(100)
      createDashboardElements()

      // Advance timers further so waitUntil's polling interval detects them
      await vi.advanceTimersByTimeAsync(100)

      const result = await readyPromise
      expect(result).toBe(true)
    })

    it('returns false when elements never appear (timeout)', async () => {
      // No dashboard elements in DOM — waitUntil will time out
      const readyPromise = dashboard.waitForDashboardReady()

      // Advance past the default timeout (30s)
      await vi.advanceTimersByTimeAsync(35_000)

      const result = await readyPromise
      expect(result).toBe(false)
    })

    it('requires both FullscreenWrapper and Content elements', async () => {
      // Only add one of the two required elements
      const wrapper = document.createElement('div')
      wrapper.className = 'liveView__FullscreenWrapper'
      document.body.appendChild(wrapper)

      const readyPromise = dashboard.waitForDashboardReady()

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(35_000)

      const result = await readyPromise
      expect(result).toBe(false)
    })
  })

  // ─── initializeDashboard ───────────────────────────────────────────

  describe('initializeDashboard', () => {
    it('returns true and calls ui.handleLiveView when dashboard is ready', async () => {
      createDashboardElements()

      const result = await dashboard.initializeDashboard()

      expect(result).toBe(true)
      expect(mockUi.handleLiveView).toHaveBeenCalled()
    })

    it('calls buttons.handleDashboardButton when dashboard is ready', async () => {
      createDashboardElements()

      await dashboard.initializeDashboard()

      expect(mockButtons.handleDashboardButton).toHaveBeenCalled()
    })

    it('calls cameras.detectCameras when dashboard is ready', async () => {
      createDashboardElements()

      await dashboard.initializeDashboard()

      expect(mockCameras.detectCameras).toHaveBeenCalled()
    })

    it('returns false when dashboard is not ready (timeout)', async () => {
      // No dashboard elements in DOM
      const initPromise = dashboard.initializeDashboard()

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(35_000)

      const result = await initPromise

      expect(result).toBe(false)
      expect(mockUi.handleLiveView).not.toHaveBeenCalled()
    })

    it('returns false and does not throw on errors', async () => {
      createDashboardElements()
      mockUi.handleLiveView.mockImplementation(() => {
        throw new Error('UI error')
      })

      const result = await dashboard.initializeDashboard()

      expect(result).toBe(false)
    })

    it('does not throw when handleDashboardButton rejects', async () => {
      createDashboardElements()
      mockButtons.handleDashboardButton.mockRejectedValue(new Error('button error'))

      // Should not throw — the rejection is caught internally
      const result = await dashboard.initializeDashboard()
      expect(result).toBe(true)
    })
  })
})
