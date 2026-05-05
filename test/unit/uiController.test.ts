import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

interface MockIpc {
  invoke: Mock
  send: Mock
  on: Mock
  once: Mock
  removeListener: Mock
  removeAllListeners: Mock
}

// Factory for creating a fresh mock ipcRenderer per test
function createMockIpc(): MockIpc {
  return {
    invoke: vi.fn().mockResolvedValue({}),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  }
}

// Use dynamic import so modules go through Vite's ESM transform
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uiController: any

describe('uiController', () => {
  let mockIpc: MockIpc

  beforeEach(async () => {
    document.body.innerHTML = ''
    document.body.appendChild(document.createElement('nav'))
    document.body.appendChild(document.createElement('header'))

    mockIpc = createMockIpc()

    if (!uiController) {
      const uiMod = await import('../../src/ts/modules/uiController')
      uiController = uiMod.default || uiMod
    }
  })

  afterEach(() => {
    if (uiController) uiController.destroy()
    document.body.innerHTML = ''
  })

  describe('getState', () => {
    it('returns initial state before initialization', () => {
      const state = uiController.getState()
      expect(state).toEqual({
        navHidden: false,
        headerHidden: false,
        isFullscreen: false,
      })
    })
  })

  describe('initialize', () => {
    it('loads config and sets state from stored values', async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({ hideNav: true, hideHeader: false })
        if (channel === 'isFullScreen') return Promise.resolve(false)
        return Promise.resolve({})
      })

      await uiController.initialize({ ipcRenderer: mockIpc })

      const state = uiController.getState()
      expect(state.navHidden).toBe(true)
      expect(state.headerHidden).toBe(false)
    })

    it('applies nav hidden state to DOM', async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({ hideNav: true })
        if (channel === 'isFullScreen') return Promise.resolve(false)
        return Promise.resolve({})
      })

      await uiController.initialize({ ipcRenderer: mockIpc })

      const nav = document.querySelector('nav')
      expect(nav.style.display).toBe('none')
    })

    it('applies header hidden state to DOM', async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({ hideHeader: true })
        if (channel === 'isFullScreen') return Promise.resolve(false)
        return Promise.resolve({})
      })

      await uiController.initialize({ ipcRenderer: mockIpc })

      const header = document.querySelector('header')
      expect(header.style.display).toBe('none')
    })

    it('registers fullscreen-change IPC listener', async () => {
      await uiController.initialize({ ipcRenderer: mockIpc })

      expect(mockIpc.on).toHaveBeenCalledWith('fullscreen-change', expect.any(Function))
    })

    it('sends initial UI state to main process', async () => {
      await uiController.initialize({ ipcRenderer: mockIpc })

      expect(mockIpc.send).toHaveBeenCalledWith('update-ui-state', {
        navHidden: false,
        headerHidden: false,
      })
    })
  })

  describe('toggleAll', () => {
    beforeEach(async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({})
        if (channel === 'isFullScreen') return Promise.resolve(false)
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })
      vi.clearAllMocks()
    })

    it('hides both nav and header when both visible', async () => {
      await uiController.toggleAll()

      const state = uiController.getState()
      expect(state.navHidden).toBe(true)
      expect(state.headerHidden).toBe(true)
    })

    it('shows both nav and header when both hidden', async () => {
      await uiController.toggleAll() // hide both
      await uiController.toggleAll() // show both

      const state = uiController.getState()
      expect(state.navHidden).toBe(false)
      expect(state.headerHidden).toBe(false)
    })

    it('applies state to DOM elements', async () => {
      await uiController.toggleAll()

      expect(document.querySelector('nav').style.display).toBe('none')
      expect(document.querySelector('header').style.display).toBe('none')
    })

    it('persists state via IPC', async () => {
      await uiController.toggleAll()

      expect(mockIpc.invoke).toHaveBeenCalledWith('configSavePartial', {
        hideNav: true,
        hideHeader: true,
      })
    })

    it('notifies main process', async () => {
      await uiController.toggleAll()

      expect(mockIpc.send).toHaveBeenCalledWith('update-ui-state', {
        navHidden: true,
        headerHidden: true,
      })
    })

    it('does not run if not initialized', async () => {
      uiController.destroy()
      document.body.appendChild(document.createElement('nav'))
      document.body.appendChild(document.createElement('header'))

      await uiController.toggleAll()

      const state = uiController.getState()
      expect(state.navHidden).toBe(false)
    })
  })

  describe('toggleNav', () => {
    beforeEach(async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({})
        if (channel === 'isFullScreen') return Promise.resolve(false)
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })
      vi.clearAllMocks()
    })

    it('toggles nav visibility', async () => {
      await uiController.toggleNav()
      expect(uiController.getState().navHidden).toBe(true)

      await uiController.toggleNav()
      expect(uiController.getState().navHidden).toBe(false)
    })

    it('does not affect header state', async () => {
      await uiController.toggleNav()
      expect(uiController.getState().headerHidden).toBe(false)
    })

    it('hides the navWrapper element when present (new Protect)', async () => {
      // Reset DOM and rebuild with the new-Protect wrapper structure.
      uiController.destroy()
      document.body.innerHTML = ''
      const wrapper = document.createElement('div')
      wrapper.className = 'navWrapper__bnl29xSM navWrapper-vertical__bnl29xSM'
      const innerNav = document.createElement('nav')
      innerNav.className = 'nav__bnl29xSM nav-vertical__bnl29xSM'
      wrapper.appendChild(innerNav)
      document.body.appendChild(wrapper)
      document.body.appendChild(document.createElement('header'))

      await uiController.initialize({ ipcRenderer: mockIpc })

      await uiController.toggleNav()

      // The wrapper should be hidden, not the inner nav (whose own display is left to Protect).
      expect(wrapper.style.display).toBe('none')
      expect(innerNav.style.display).toBe('')

      await uiController.toggleNav()
      // Restoring visibility clears the inline override (no `display: flex`).
      // We let Protect's own CSS govern when the sidebar is shown.
      expect(wrapper.style.display).toBe('')
    })

    it('falls back to <nav> element when no navWrapper exists (old Protect)', async () => {
      uiController.destroy()
      document.body.innerHTML = ''
      const oldNav = document.createElement('nav')
      oldNav.className = 'nav__ZljDoyET nav-auto__ZljDoyET'
      document.body.appendChild(oldNav)
      document.body.appendChild(document.createElement('header'))

      await uiController.initialize({ ipcRenderer: mockIpc })
      await uiController.toggleNav()

      expect(oldNav.style.display).toBe('none')
    })

    it('does NOT write inline display when nav is visible', async () => {
      // Regression guard: previously we wrote `display: flex` inline whenever
      // nav was visible, which collided with Protect's styled-components
      // layout (e.g. broke the divider-collapse toggle button position and
      // click handler). Visible-state should leave the inline style empty.
      uiController.destroy()
      document.body.innerHTML = ''
      const oldNav = document.createElement('nav')
      document.body.appendChild(oldNav)
      document.body.appendChild(document.createElement('header'))

      await uiController.initialize({ ipcRenderer: mockIpc })

      // Initial state (visible) — no inline display.
      expect(oldNav.style.display).toBe('')

      // Toggle to hidden → 'none', then toggle back to visible → cleared.
      await uiController.toggleNav()
      expect(oldNav.style.display).toBe('none')
      await uiController.toggleNav()
      expect(oldNav.style.display).toBe('')
    })
  })

  describe('toggleHeader', () => {
    beforeEach(async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({})
        if (channel === 'isFullScreen') return Promise.resolve(false)
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })
      vi.clearAllMocks()
    })

    it('toggles header visibility', async () => {
      await uiController.toggleHeader()
      expect(uiController.getState().headerHidden).toBe(true)

      await uiController.toggleHeader()
      expect(uiController.getState().headerHidden).toBe(false)
    })

    it('does not affect nav state', async () => {
      await uiController.toggleHeader()
      expect(uiController.getState().navHidden).toBe(false)
    })
  })

  describe('button registry', () => {
    beforeEach(async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({})
        if (channel === 'isFullScreen') return Promise.resolve(false)
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })
      vi.clearAllMocks()
    })

    it('registers a button updater and calls it immediately with current state', () => {
      const updater = vi.fn()
      uiController.registerButton('test-button', updater)

      expect(updater).toHaveBeenCalledWith({
        navHidden: false,
        headerHidden: false,
        isFullscreen: false,
      })
    })

    it('calls registered updaters on state change', async () => {
      const updater = vi.fn()
      uiController.registerButton('test-button', updater)
      updater.mockClear()

      await uiController.toggleNav()

      expect(updater).toHaveBeenCalledWith(
        expect.objectContaining({
          navHidden: true,
        }),
      )
    })

    it('unregisters buttons', async () => {
      const updater = vi.fn()
      uiController.registerButton('test-button', updater)
      updater.mockClear()

      uiController.unregisterButton('test-button')
      await uiController.toggleNav()

      expect(updater).not.toHaveBeenCalled()
    })

    it('unregisters all buttons', async () => {
      const updater1 = vi.fn()
      const updater2 = vi.fn()
      uiController.registerButton('btn-1', updater1)
      uiController.registerButton('btn-2', updater2)
      updater1.mockClear()
      updater2.mockClear()

      uiController.unregisterAllButtons()
      await uiController.toggleNav()

      expect(updater1).not.toHaveBeenCalled()
      expect(updater2).not.toHaveBeenCalled()
    })

    it('handles errors in updater functions gracefully', async () => {
      const badUpdater = vi.fn().mockImplementation(() => {
        throw new Error('updater error')
      })
      uiController.registerButton('bad-button', badUpdater)

      await uiController.toggleNav()
    })
  })

  describe('onStateChange', () => {
    beforeEach(async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({})
        if (channel === 'isFullScreen') return Promise.resolve(false)
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })
      vi.clearAllMocks()
    })

    it('calls listener on state change', async () => {
      const listener = vi.fn()
      uiController.onStateChange(listener)

      await uiController.toggleNav()

      expect(listener).toHaveBeenCalled()
    })

    it('returns an unsubscribe function', async () => {
      const listener = vi.fn()
      const unsubscribe = uiController.onStateChange(listener)

      unsubscribe()
      await uiController.toggleNav()

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('enforceCurrentState', () => {
    it('applies current state to DOM', async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({ hideNav: true, hideHeader: true })
        if (channel === 'isFullScreen') return Promise.resolve(false)
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })

      document.querySelector('nav').style.display = 'flex'
      document.querySelector('header').style.display = 'flex'

      uiController.enforceCurrentState()

      expect(document.querySelector('nav').style.display).toBe('none')
      expect(document.querySelector('header').style.display).toBe('none')
    })
  })

  describe('handleUrlChange', () => {
    beforeEach(async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({ hideNav: true })
        if (channel === 'isFullScreen') return Promise.resolve(false)
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })
      vi.clearAllMocks()
    })

    it('re-enforces current state on URL change', () => {
      document.querySelector('nav').style.display = 'flex'

      uiController.handleUrlChange('/protect/devices', '/protect/dashboard')

      expect(document.querySelector('nav').style.display).toBe('none')
    })

    it('notifies state change listeners', () => {
      const listener = vi.fn()
      uiController.onStateChange(listener)

      uiController.handleUrlChange('/protect/devices', '/protect/dashboard')

      expect(listener).toHaveBeenCalled()
    })
  })

  describe('destroy', () => {
    it('cleans up listeners and state', async () => {
      await uiController.initialize({ ipcRenderer: mockIpc })

      uiController.registerButton('test', vi.fn())
      uiController.onStateChange(vi.fn())

      uiController.destroy()

      expect(mockIpc.removeListener).toHaveBeenCalledWith('fullscreen-change', expect.any(Function))
    })

    it('resets state to defaults', async () => {
      mockIpc.invoke.mockImplementation((channel) => {
        if (channel === 'configLoad') return Promise.resolve({ hideNav: true, hideHeader: true })
        if (channel === 'isFullScreen') return Promise.resolve(true)
        return Promise.resolve({})
      })
      await uiController.initialize({ ipcRenderer: mockIpc })

      uiController.destroy()

      const state = uiController.getState()
      expect(state.navHidden).toBe(false)
      expect(state.headerHidden).toBe(false)
      expect(state.isFullscreen).toBe(false)
    })
  })
})
