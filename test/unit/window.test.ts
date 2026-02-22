import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import Module from 'module'

// ── ESM mocks for window.ts dependencies ─────────────────────────────────────

vi.mock('../../src/ts/modules/paths', () => ({
  preloadPath: vi.fn().mockReturnValue('/mock/preload.js'),
  htmlUrl: vi.fn((file: string) => `app://local/src/html/${file}`),
  imgPath: vi.fn().mockReturnValue('/mock/img/128.png'),
}))

vi.mock('../../src/ts/modules/version', () => ({
  userAgent: 'MockUserAgent/1.0',
}))

vi.mock('../../src/ts/modules/utils', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}))

// ── CJS require('electron') interception ─────────────────────────────────────
// window.ts uses `const { ... } = require('electron')` which bypasses vi.mock.
// Redirect to our mock file so window.ts gets the same mock instances.

const originalResolveFilename = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

afterAll(() => {
  ;(Module as any)._resolveFilename = originalResolveFilename
})

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** Access the CJS electron mock — same instance window.ts will receive. */
function getElectronMock() {
  return require('electron') as {
    BrowserWindow: ReturnType<typeof vi.fn>
    app: {
      getVersion: ReturnType<typeof vi.fn>
      getAppPath: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
      quit: ReturnType<typeof vi.fn>
    }
    nativeTheme: { shouldUseDarkColors: boolean }
    session: { defaultSession: { flushStorageData: ReturnType<typeof vi.fn> } }
    globalShortcut: { unregisterAll: ReturnType<typeof vi.fn> }
  }
}

/** Create a mock BrowserWindow instance that captures event handlers. */
function createMockWindowInstance() {
  const eventHandlers: Record<string, Function[]> = {}

  const instance = {
    on: vi.fn((event: string, handler: Function) => {
      if (!eventHandlers[event]) eventHandlers[event] = []
      eventHandlers[event].push(handler)
    }),
    once: vi.fn((event: string, handler: Function) => {
      if (!eventHandlers[event]) eventHandlers[event] = []
      eventHandlers[event].push(handler)
    }),
    show: vi.fn(),
    loadURL: vi.fn(),
    setTitle: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1270, height: 750 }),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      setUserAgent: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      openDevTools: vi.fn(),
      toggleDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
    /** Trigger all handlers registered for the given event name. */
    triggerEvent(name: string, ...args: any[]) {
      for (const handler of eventHandlers[name] || []) {
        handler(...args)
      }
    },
  }

  return instance
}

function createMockStore(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { url: 'https://protect.local', ...overrides }
  return {
    get: vi.fn((key: string) => data[key]),
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value
    }),
  }
}

// ── Load window module (once, via ESM pipeline) ──────────────────────────────

let windowModule: typeof import('../../src/ts/modules/window')

async function loadWindowModule() {
  if (!windowModule) {
    windowModule = await import('../../src/ts/modules/window')
  }
  return windowModule
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('window.ts', () => {
  let mockWindow: ReturnType<typeof createMockWindowInstance>
  let electron: ReturnType<typeof getElectronMock>

  beforeEach(async () => {
    mockWindow = createMockWindowInstance()
    electron = getElectronMock()

    // Must use a regular function (not arrow) so it can be called with `new`
    electron.BrowserWindow.mockImplementation(function () {
      return mockWindow
    })
    electron.BrowserWindow.mockClear()
    electron.session.defaultSession.flushStorageData.mockClear()
    electron.nativeTheme.shouldUseDarkColors = false

    await loadWindowModule()
  })

  describe('localStorage persistence (flushStorageData regression guard)', () => {
    it('calls flushStorageData on window close', async () => {
      const { createWindow } = await loadWindowModule()
      await createWindow(createMockStore())

      // Simulate the window close event
      mockWindow.triggerEvent('close')

      expect(electron.session.defaultSession.flushStorageData).toHaveBeenCalled()
    })
  })

  describe('dark-mode startup flash prevention', () => {
    it('creates the window with show: false', async () => {
      const { createWindow } = await loadWindowModule()
      await createWindow(createMockStore())

      const opts = electron.BrowserWindow.mock.calls[0][0]
      expect(opts.show).toBe(false)
    })

    it('shows the window on ready-to-show', async () => {
      const { createWindow } = await loadWindowModule()
      await createWindow(createMockStore())

      mockWindow.triggerEvent('ready-to-show')

      expect(mockWindow.show).toHaveBeenCalled()
    })

    it('uses dark backgroundColor when system is in dark mode', async () => {
      electron.nativeTheme.shouldUseDarkColors = true

      const { createWindow } = await loadWindowModule()
      await createWindow(createMockStore())

      const opts = electron.BrowserWindow.mock.calls[0][0]
      expect(opts.backgroundColor).toBe('#1a1a1a')
    })

    it('uses light backgroundColor when system is in light mode', async () => {
      electron.nativeTheme.shouldUseDarkColors = false

      const { createWindow } = await loadWindowModule()
      await createWindow(createMockStore())

      const opts = electron.BrowserWindow.mock.calls[0][0]
      expect(opts.backgroundColor).toBe('#f0f0f0')
    })
  })
})
