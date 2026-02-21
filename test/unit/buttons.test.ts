import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Module from 'module'
import type { UIState } from '../../src/ts/types/state'

// Intercept require('electron') at the Node.js level so that CJS
// require('electron') in source modules returns our mock instead of
// the Electron binary path. Vitest's vi.mock only intercepts ESM imports.
const originalResolveFilename = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Dynamically import the buttons module so it goes through Vite's ESM
// transform. The Module._resolveFilename patch above ensures the
// require('electron') inside buttons.ts returns our mock.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let buttons: any

async function loadButtons() {
  if (!buttons) {
    const mod = await import('../../src/ts/modules/buttons')
    buttons = mod
  }
  return buttons
}

/** Helper to set up a minimal DOM with <header> and <nav> for button injection. */
function setupDOM(): void {
  document.body.innerHTML = ''
  const nav = document.createElement('nav')
  document.body.appendChild(nav)

  const header = document.createElement('header')
  // createHeaderButton filters out .global-loader children, then if
  // there are >1 remaining children it prepends to the last one.
  // Provide two children so the prepend path is exercised.
  const headerChild1 = document.createElement('div')
  headerChild1.className = 'header-group-1'
  header.appendChild(headerChild1)
  const headerChild2 = document.createElement('div')
  headerChild2.className = 'header-group-2'
  header.appendChild(headerChild2)
  document.body.appendChild(header)
}

/** Creates a default UIState for updater calls. */
function defaultState(overrides: Partial<UIState> = {}): UIState {
  return {
    navHidden: false,
    headerHidden: false,
    isFullscreen: false,
    ...overrides,
  }
}

/** Get the mocked ipcRenderer from the intercepted electron module. */
function getMockIpcRenderer() {
  const electron = require('electron')
  return electron.ipcRenderer
}

describe('buttons', () => {
  beforeEach(async () => {
    setupDOM()
    // Reset mock call history between tests
    const ipc = getMockIpcRenderer()
    ipc.invoke.mockClear()
    ipc.send.mockClear()
    ipc.on.mockClear()
    await loadButtons()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  // ─── injectFullscreenButton ──────────────────────────────────────────

  describe('injectFullscreenButton', () => {
    it('creates a fullscreen button in the header', async () => {
      const onClick = vi.fn()
      const updater = await buttons.injectFullscreenButton(onClick)

      expect(updater).toBeTypeOf('function')

      const btn = document.getElementById('fullscreen-button')
      expect(btn).not.toBeNull()
      expect(btn!.tagName).toBe('BUTTON')
      expect(btn!.className).toBe('header-button')
    })

    it('places the button inside the header', async () => {
      await buttons.injectFullscreenButton(vi.fn())

      const header = document.querySelector('header')
      const btn = document.getElementById('fullscreen-button')
      expect(header!.contains(btn)).toBe(true)
    })

    it('returns an updater that shows "Fullscreen" when not fullscreen', async () => {
      const updater = await buttons.injectFullscreenButton(vi.fn())

      updater!(defaultState({ isFullscreen: false }))

      const label = document.getElementById('fullscreen-button-label')
      expect(label).not.toBeNull()
      expect(label!.textContent).toContain('Fullscreen')
      expect(label!.textContent).not.toContain('Exit')
    })

    it('returns an updater that shows "Exit Fullscreen" when fullscreen', async () => {
      const updater = await buttons.injectFullscreenButton(vi.fn())

      updater!(defaultState({ isFullscreen: true }))

      const label = document.getElementById('fullscreen-button-label')
      expect(label).not.toBeNull()
      expect(label!.innerHTML).toContain('Exit')
      expect(label!.innerHTML).toContain('Fullscreen')
    })

    it('updates the icon based on fullscreen state', async () => {
      const updater = await buttons.injectFullscreenButton(vi.fn())

      updater!(defaultState({ isFullscreen: false }))
      const iconEnter = document.getElementById('fullscreen-icon')?.innerHTML
      expect(iconEnter).toContain('svg')

      updater!(defaultState({ isFullscreen: true }))
      const iconExit = document.getElementById('fullscreen-icon')?.innerHTML
      expect(iconExit).toContain('svg')

      // The two icons should differ (enter vs exit)
      expect(iconEnter).not.toBe(iconExit)
    })

    it('wires the onClick callback to the button', async () => {
      const onClick = vi.fn()
      await buttons.injectFullscreenButton(onClick)

      const btn = document.getElementById('fullscreen-button') as HTMLButtonElement
      btn.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — calling twice does not create a duplicate button', async () => {
      await buttons.injectFullscreenButton(vi.fn())
      await buttons.injectFullscreenButton(vi.fn())

      const allButtons = document.querySelectorAll('#fullscreen-button')
      expect(allButtons.length).toBe(1)
    })

    it('returns an updater even on idempotent second call', async () => {
      await buttons.injectFullscreenButton(vi.fn())
      const updater2 = await buttons.injectFullscreenButton(vi.fn())
      expect(updater2).toBeTypeOf('function')
    })

    it('uses toggleFullscreen as default onClick when none provided', async () => {
      const ipc = getMockIpcRenderer()
      await buttons.injectFullscreenButton()

      const btn = document.getElementById('fullscreen-button') as HTMLButtonElement
      btn.click()

      expect(ipc.send).toHaveBeenCalledWith('toggleFullscreen')
    })

    it('updater is a no-op when the button element is missing', async () => {
      const updater = await buttons.injectFullscreenButton(vi.fn())

      // Remove the button from the DOM
      document.getElementById('fullscreen-button')?.remove()

      // Should not throw
      expect(() => updater!(defaultState({ isFullscreen: true }))).not.toThrow()
    })

    it('calls ipcRenderer.invoke("isFullScreen") for initial state', async () => {
      const ipc = getMockIpcRenderer()
      await buttons.injectFullscreenButton(vi.fn())

      expect(ipc.invoke).toHaveBeenCalledWith('isFullScreen')
    })
  })

  // ─── injectSidebarButton ────────────────────────────────────────────

  describe('injectSidebarButton', () => {
    it('creates a sidebar toggle button in the header', async () => {
      const onClick = vi.fn()
      const updater = await buttons.injectSidebarButton(onClick)

      expect(updater).toBeTypeOf('function')

      const btn = document.getElementById('sidebar-button')
      expect(btn).not.toBeNull()
      expect(btn!.className).toBe('header-button')
    })

    it('places the button inside the header', async () => {
      await buttons.injectSidebarButton(vi.fn())

      const header = document.querySelector('header')
      const btn = document.getElementById('sidebar-button')
      expect(header!.contains(btn)).toBe(true)
    })

    it('returns an updater that shows "Hide Nav" when nav is visible', async () => {
      const updater = await buttons.injectSidebarButton(vi.fn())

      updater!(defaultState({ navHidden: false }))

      const label = document.getElementById('sidebar-button-label')
      expect(label).not.toBeNull()
      expect(label!.textContent).toContain('Hide')
      expect(label!.textContent).toContain('Nav')
    })

    it('returns an updater that shows "Show Nav" when nav is hidden', async () => {
      const updater = await buttons.injectSidebarButton(vi.fn())

      updater!(defaultState({ navHidden: true }))

      const label = document.getElementById('sidebar-button-label')
      expect(label).not.toBeNull()
      expect(label!.textContent).toContain('Show')
      expect(label!.textContent).toContain('Nav')
    })

    it('updates the sidebar icon based on navHidden state', async () => {
      const updater = await buttons.injectSidebarButton(vi.fn())

      updater!(defaultState({ navHidden: false }))
      const iconVisible = document.getElementById('sidebar-icon')?.innerHTML

      updater!(defaultState({ navHidden: true }))
      const iconHidden = document.getElementById('sidebar-icon')?.innerHTML

      expect(iconVisible).toContain('svg')
      expect(iconHidden).toContain('svg')
      // The two icons should differ (visible vs hidden arrow direction)
      expect(iconVisible).not.toBe(iconHidden)
    })

    it('wires the onClick callback to the button', async () => {
      const onClick = vi.fn()
      await buttons.injectSidebarButton(onClick)

      const btn = document.getElementById('sidebar-button') as HTMLButtonElement
      btn.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — calling twice does not create a duplicate button', async () => {
      await buttons.injectSidebarButton(vi.fn())
      await buttons.injectSidebarButton(vi.fn())

      const allButtons = document.querySelectorAll('#sidebar-button')
      expect(allButtons.length).toBe(1)
    })

    it('updater is a no-op when the button element is missing', async () => {
      const updater = await buttons.injectSidebarButton(vi.fn())

      document.getElementById('sidebar-button')?.remove()

      expect(() => updater!(defaultState({ navHidden: true }))).not.toThrow()
    })

    it('calls ipcRenderer.invoke("configLoad") for initial state', async () => {
      const ipc = getMockIpcRenderer()
      await buttons.injectSidebarButton(vi.fn())

      expect(ipc.invoke).toHaveBeenCalledWith('configLoad')
    })
  })

  // ─── injectHeaderToggleButton ────────────────────────────────────────

  describe('injectHeaderToggleButton', () => {
    it('creates a header toggle button in the nav', async () => {
      const onClick = vi.fn()
      const updater = await buttons.injectHeaderToggleButton(onClick)

      expect(updater).toBeTypeOf('function')

      const btn = document.getElementById('header-toggle-button')
      expect(btn).not.toBeNull()
      expect(btn!.className).toBe('custom-nav-button')
    })

    it('places the button inside the nav element', async () => {
      await buttons.injectHeaderToggleButton(vi.fn())

      const nav = document.querySelector('nav')
      const btn = document.getElementById('header-toggle-button')
      expect(nav!.contains(btn)).toBe(true)
    })

    it('returns an updater that sets SVG content when header is visible', async () => {
      const updater = await buttons.injectHeaderToggleButton(vi.fn())

      updater!(defaultState({ headerHidden: false }))

      const btn = document.getElementById('header-toggle-button')
      expect(btn!.innerHTML).toContain('svg')
    })

    it('returns an updater that sets SVG content when header is hidden', async () => {
      const updater = await buttons.injectHeaderToggleButton(vi.fn())

      updater!(defaultState({ headerHidden: true }))

      const btn = document.getElementById('header-toggle-button')
      expect(btn!.innerHTML).toContain('svg')
    })

    it('updater changes content based on headerHidden state', async () => {
      const updater = await buttons.injectHeaderToggleButton(vi.fn())

      updater!(defaultState({ headerHidden: false }))
      const contentVisible = document.getElementById('header-toggle-button')!.innerHTML

      updater!(defaultState({ headerHidden: true }))
      const contentHidden = document.getElementById('header-toggle-button')!.innerHTML

      // The icons differ between show/hide states
      expect(contentVisible).not.toBe(contentHidden)
    })

    it('wires the onClick callback to the button', async () => {
      const onClick = vi.fn()
      await buttons.injectHeaderToggleButton(onClick)

      const btn = document.getElementById('header-toggle-button') as HTMLButtonElement
      btn.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — calling twice does not create a duplicate button', async () => {
      await buttons.injectHeaderToggleButton(vi.fn())
      await buttons.injectHeaderToggleButton(vi.fn())

      const allButtons = document.querySelectorAll('#header-toggle-button')
      expect(allButtons.length).toBe(1)
    })

    it('updater is a no-op when the button element is missing', async () => {
      const updater = await buttons.injectHeaderToggleButton(vi.fn())

      document.getElementById('header-toggle-button')?.remove()

      expect(() => updater!(defaultState({ headerHidden: true }))).not.toThrow()
    })

    it('has a tooltip of "Toggle Header"', async () => {
      await buttons.injectHeaderToggleButton(vi.fn())

      const btn = document.getElementById('header-toggle-button')
      expect(btn!.title).toBe('Toggle Header')
    })

    it('has role="button" attribute', async () => {
      await buttons.injectHeaderToggleButton(vi.fn())

      const btn = document.getElementById('header-toggle-button')
      expect(btn!.getAttribute('role')).toBe('button')
    })
  })

  // ─── injectDashboardButton ──────────────────────────────────────────

  describe('injectDashboardButton', () => {
    it('creates a dashboard button appended to body', () => {
      const btn = buttons.injectDashboardButton()

      expect(btn).toBeDefined()
      expect(btn!.id).toBe('dashboard-button')
      expect(btn!.className).toBe('dashboard-button')
    })

    it('button is initially hidden (display: none)', () => {
      const btn = buttons.injectDashboardButton()
      expect(btn!.style.display).toBe('none')
    })

    it('button contains dashboard icon SVG and arrow', () => {
      const btn = buttons.injectDashboardButton()
      expect(btn!.innerHTML).toContain('svg')
      expect(btn!.innerHTML).toContain('\u2190') // left arrow
    })

    it('is idempotent — calling twice does not create a duplicate', () => {
      buttons.injectDashboardButton()
      const secondResult = buttons.injectDashboardButton()

      expect(secondResult).toBeUndefined()

      const allButtons = document.querySelectorAll('#dashboard-button')
      expect(allButtons.length).toBe(1)
    })

    it('creates a show-nav-popup element', () => {
      buttons.injectDashboardButton()

      const popup = document.getElementById('show-nav-popup')
      expect(popup).not.toBeNull()
      expect(popup!.className).toBe('nav-popup')
      expect(popup!.innerHTML).toContain('Esc')
      expect(popup!.innerHTML).toContain('Toggle Navigation')
    })
  })

  // ─── setDashboardButtonVisibility ───────────────────────────────────

  describe('setDashboardButtonVisibility', () => {
    it('shows the dashboard button when called with true', () => {
      buttons.injectDashboardButton()
      buttons.setDashboardButtonVisibility(true)

      const btn = document.getElementById('dashboard-button')
      expect(btn!.style.display).toBe('block')
    })

    it('hides the dashboard button when called with false', () => {
      buttons.injectDashboardButton()
      buttons.setDashboardButtonVisibility(true)
      buttons.setDashboardButtonVisibility(false)

      const btn = document.getElementById('dashboard-button')
      expect(btn!.style.display).toBe('none')
    })

    it('is a no-op when the button does not exist', () => {
      // Should not throw when the button is missing
      expect(() => buttons.setDashboardButtonVisibility(true)).not.toThrow()
    })
  })

  // ─── toggleFullscreen ───────────────────────────────────────────────

  describe('toggleFullscreen', () => {
    it('sends toggleFullscreen IPC message', () => {
      const ipc = getMockIpcRenderer()

      buttons.toggleFullscreen()

      expect(ipc.send).toHaveBeenCalledWith('toggleFullscreen')
    })
  })

  // ─── triggerDashboardNavigation ─────────────────────────────────────

  describe('triggerDashboardNavigation', () => {
    it('clicks existing dashboard link if present', () => {
      Object.defineProperty(document, 'URL', {
        writable: true,
        value: 'https://192.168.1.1/protect/devices',
        configurable: true,
      })

      const link = document.createElement('a')
      link.href = 'https://192.168.1.1/protect/dashboard'
      link.click = vi.fn()
      document.body.appendChild(link)

      buttons.triggerDashboardNavigation()

      expect(link.click).toHaveBeenCalled()
    })

    it('falls back to window.location.href when no dashboard link exists', () => {
      Object.defineProperty(document, 'URL', {
        writable: true,
        value: 'https://192.168.1.1/protect/devices',
        configurable: true,
      })
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: 'https://192.168.1.1/protect/devices' },
      })

      buttons.triggerDashboardNavigation()

      expect(window.location.href).toBe('https://192.168.1.1/protect/dashboard')
    })
  })

  // ─── createNavButton ────────────────────────────────────────────────

  describe('createNavButton', () => {
    it('creates a button in the nav element', async () => {
      const result = await buttons.createNavButton({
        id: 'test-nav-btn',
        tooltip: 'Test Button',
        onClick: vi.fn(),
        content: '<span>Test</span>',
      })

      expect(result).toBe(true)

      const btn = document.getElementById('test-nav-btn')
      expect(btn).not.toBeNull()
      expect(btn!.className).toBe('custom-nav-button')
      expect(btn!.title).toBe('Test Button')
      expect(btn!.getAttribute('role')).toBe('button')
      expect(btn!.innerHTML).toContain('Test')
    })

    it('prepends the button to nav', async () => {
      // Add an existing child to nav so we can verify prepend behavior
      const existingChild = document.createElement('div')
      existingChild.id = 'existing-nav-child'
      document.querySelector('nav')!.appendChild(existingChild)

      await buttons.createNavButton({
        id: 'prepended-btn',
        tooltip: 'Prepend Test',
        onClick: vi.fn(),
        content: '<span>Prepended</span>',
      })

      const nav = document.querySelector('nav')!
      expect(nav.firstElementChild!.id).toBe('prepended-btn')
    })

    it('is idempotent — returns true without creating duplicates', async () => {
      await buttons.createNavButton({
        id: 'idempotent-nav-btn',
        tooltip: 'Once',
        onClick: vi.fn(),
        content: '<span>Once</span>',
      })

      const result = await buttons.createNavButton({
        id: 'idempotent-nav-btn',
        tooltip: 'Twice',
        onClick: vi.fn(),
        content: '<span>Twice</span>',
      })

      expect(result).toBe(true)
      expect(document.querySelectorAll('#idempotent-nav-btn').length).toBe(1)
    })

    it('wires the onClick handler', async () => {
      const onClick = vi.fn()
      await buttons.createNavButton({
        id: 'click-nav-btn',
        tooltip: 'Clickable',
        onClick,
        content: '<span>Click me</span>',
      })

      const btn = document.getElementById('click-nav-btn') as HTMLButtonElement
      btn.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('returns false when nav element does not exist', { timeout: 10000 }, async () => {
      // Remove the nav element
      document.querySelector('nav')?.remove()

      const result = await buttons.createNavButton({
        id: 'no-nav-btn',
        tooltip: 'No Nav',
        onClick: vi.fn(),
        content: '<span>No Nav</span>',
      })

      expect(result).toBe(false)
    })
  })

  // ─── createHeaderButton ─────────────────────────────────────────────

  describe('createHeaderButton', () => {
    it('creates a button in the header', async () => {
      const result = await buttons.createHeaderButton({
        id: 'test-header-btn',
        label: 'Test',
        onClick: vi.fn(),
      })

      expect(result).toBe(true)

      const btn = document.getElementById('test-header-btn')
      expect(btn).not.toBeNull()
      expect(btn!.className).toBe('header-button')
    })

    it('prepends button to the last non-global-loader header child', async () => {
      await buttons.createHeaderButton({
        id: 'prepend-test-btn',
        label: 'Prepend',
        onClick: vi.fn(),
      })

      // With 2 children in header, the button is prepended to the last child
      const lastChild = document.querySelector('header .header-group-2')!
      expect(lastChild.firstElementChild!.id).toBe('prepend-test-btn')
    })

    it('appends to header when there are no valid target children', async () => {
      // Set up header with only a global-loader child (filtered out)
      const header = document.querySelector('header')!
      header.innerHTML = ''
      const loader = document.createElement('div')
      loader.className = 'global-loader'
      header.appendChild(loader)

      await buttons.createHeaderButton({
        id: 'appended-btn',
        label: 'Appended',
        onClick: vi.fn(),
      })

      const btn = document.getElementById('appended-btn')
      expect(header.contains(btn)).toBe(true)
    })

    it('appends to header when there is only one non-loader child', async () => {
      // Set up header with only one child (targetElement will be null)
      const header = document.querySelector('header')!
      header.innerHTML = ''
      const singleChild = document.createElement('div')
      header.appendChild(singleChild)

      await buttons.createHeaderButton({
        id: 'single-child-btn',
        label: 'Single',
        onClick: vi.fn(),
      })

      const btn = document.getElementById('single-child-btn')
      expect(header.contains(btn)).toBe(true)
      // Button should be a direct child of header (appended), not inside singleChild
      expect(header.lastElementChild!.id).toBe('single-child-btn')
    })

    it('is idempotent — returns true without creating duplicates', async () => {
      await buttons.createHeaderButton({
        id: 'idem-header-btn',
        label: 'Once',
        onClick: vi.fn(),
      })

      const result = await buttons.createHeaderButton({
        id: 'idem-header-btn',
        label: 'Twice',
        onClick: vi.fn(),
      })

      expect(result).toBe(true)
      expect(document.querySelectorAll('#idem-header-btn').length).toBe(1)
    })

    it('calls updateContent callback after creation', async () => {
      const updateContent = vi.fn()
      await buttons.createHeaderButton({
        id: 'update-content-btn',
        label: 'Updated',
        onClick: vi.fn(),
        updateContent,
        icons: { up: 'UP', down: 'DOWN' },
      })

      expect(updateContent).toHaveBeenCalledTimes(1)
      const [btnArg, iconsArg] = updateContent.mock.calls[0]
      expect(btnArg).toBeInstanceOf(HTMLButtonElement)
      expect(btnArg.id).toBe('update-content-btn')
      expect(iconsArg).toEqual({ up: 'UP', down: 'DOWN' })
    })

    it('returns false when header does not exist', { timeout: 10000 }, async () => {
      document.querySelector('header')?.remove()

      const result = await buttons.createHeaderButton({
        id: 'no-header-btn',
        label: 'No Header',
        onClick: vi.fn(),
      })

      expect(result).toBe(false)
    })

    it('injects button styles if not already present', async () => {
      // Ensure no styles exist yet
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      await buttons.createHeaderButton({
        id: 'styles-test-btn',
        label: 'Styles',
        onClick: vi.fn(),
      })

      const styleEl = document.getElementById('unifi-protect-viewer-button-styles')
      expect(styleEl).not.toBeNull()
    })

    it('contains a label element with the provided label text', async () => {
      await buttons.createHeaderButton({
        id: 'label-test-btn',
        label: 'My Label',
        onClick: vi.fn(),
      })

      const label = document.getElementById('label-test-btn-label')
      expect(label).not.toBeNull()
      expect(label!.textContent!.trim()).toBe('My Label')
    })
  })

  // ─── Style injection ───────────────────────────────────────────────

  describe('style injection', () => {
    it('injects button styles when creating a fullscreen button', async () => {
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      await buttons.injectFullscreenButton(vi.fn())

      expect(document.getElementById('unifi-protect-viewer-button-styles')).not.toBeNull()
    })

    it('injects button styles when creating a sidebar button', async () => {
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      await buttons.injectSidebarButton(vi.fn())

      expect(document.getElementById('unifi-protect-viewer-button-styles')).not.toBeNull()
    })

    it('injects button styles when creating a dashboard button', () => {
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      buttons.injectDashboardButton()

      expect(document.getElementById('unifi-protect-viewer-button-styles')).not.toBeNull()
    })

    it('does not duplicate styles if already injected', async () => {
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      await buttons.injectFullscreenButton(vi.fn())
      // Remove the button to allow re-injection, but keep styles
      document.getElementById('fullscreen-button')?.remove()
      await buttons.injectFullscreenButton(vi.fn())

      const styleEls = document.querySelectorAll('#unifi-protect-viewer-button-styles')
      expect(styleEls.length).toBe(1)
    })
  })
})
