import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Module from 'module'
import path from 'path'

// ---------------------------------------------------------------------------
// CJS require() interception
// ---------------------------------------------------------------------------
// navigation.ts uses lazy `require('./uiController')` and `require('./ui')`
// inside functions. These are CJS require calls that bypass Vite's ESM
// transform, so vi.mock() cannot intercept them. We use the same
// Module._resolveFilename technique from buttons.test.ts to redirect them
// to our mock objects.

const mockUiController = {
  handleUrlChange: vi.fn(),
}

const mockUi = {
  initializeDashboardPage: vi.fn().mockReturnValue(true),
  handleLiveView: vi.fn(),
}

const srcModulesDir = path.resolve(__dirname, '../../src/ts/modules')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalResolveFilename = (Module as any)._resolveFilename
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  // Intercept require('electron') for modules like dashboard.ts and auth.ts
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }

  // Intercept lazy require('./uiController') from navigation.ts
  if (request === './uiController' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    // Return a sentinel path; we register it below
    return '__mock__uiController__'
  }

  // Intercept lazy require('./ui') from navigation.ts (and dashboard.ts)
  if (request === './ui' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__ui__'
  }

  // Intercept lazy require('./buttons') from dashboard.ts
  if (request === './buttons' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__buttons__'
  }

  // Intercept lazy require('./cameras') from dashboard.ts
  if (request === './cameras' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__cameras__'
  }

  // Intercept lazy require('./dashboard') from auth.ts
  if (request === './dashboard' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__dashboard__'
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Register our sentinel paths in Node's require cache
// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__uiController__'] = {
  id: '__mock__uiController__',
  filename: '__mock__uiController__',
  loaded: true,
  exports: mockUiController,
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__ui__'] = {
  id: '__mock__ui__',
  filename: '__mock__ui__',
  loaded: true,
  exports: mockUi,
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__buttons__'] = {
  id: '__mock__buttons__',
  filename: '__mock__buttons__',
  loaded: true,
  exports: {
    handleDashboardButton: vi.fn().mockResolvedValue(undefined),
  },
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__cameras__'] = {
  id: '__mock__cameras__',
  filename: '__mock__cameras__',
  loaded: true,
  exports: {
    detectCameras: vi.fn(),
  },
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__dashboard__'] = {
  id: '__mock__dashboard__',
  filename: '__mock__dashboard__',
  loaded: true,
  exports: {
    initializeDashboard: vi.fn().mockResolvedValue(true),
    isDashboardPage: vi.fn().mockReturnValue(false),
    notifyDashboardState: vi.fn(),
    waitForDashboardReady: vi.fn().mockResolvedValue(true),
  },
} as unknown as NodeModule

// ---------------------------------------------------------------------------
// ESM mocks for top-level imports in navigation.ts
// ---------------------------------------------------------------------------

vi.mock('../../src/ts/modules/utils', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  waitUntil: vi.fn().mockResolvedValue(undefined),
  setStyle: vi.fn(),
  clickElement: vi.fn(),
}))

vi.mock('../../src/ts/modules/auth', () => ({
  isLoginPage: vi.fn().mockReturnValue(false),
  initializeLoginPage: vi.fn().mockReturnValue(false),
  resetLoginAttempts: vi.fn().mockResolvedValue(undefined),
  attemptLogin: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../src/ts/modules/dashboard', () => ({
  initializeDashboard: vi.fn().mockResolvedValue(true),
  isDashboardPage: vi.fn().mockReturnValue(false),
  notifyDashboardState: vi.fn(),
  waitForDashboardReady: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../src/ts/modules/constants', () => ({
  DASHBOARD_RETRY_DELAY_MS: 100,
  DOM_ELEMENT_WAIT_MS: 5000,
  WIDGET_TRANSITION_MS: 350,
  LOGIN_ATTEMPTS_RESET_MS: 1800000,
  LOGIN_SUCCESS_CHECK_INTERVAL_MS: 500,
  LOGIN_SUCCESS_MAX_WAIT_MS: 30000,
  POST_LOGIN_DASHBOARD_DELAY_MS: 1000,
  POST_LOGIN_DASHBOARD_RETRY_DELAY_MS: 2000,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save and restore window.location between tests */
const originalLocation = window.location

function setLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: new URL(url),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
    setLocation('https://protect.local/protect/dashboard')
    vi.mocked(mockUiController.handleUrlChange).mockClear()
    vi.mocked(mockUi.initializeDashboardPage).mockClear()
    vi.mocked(mockUi.handleLiveView).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    })
  })

  describe('setupNavigationMonitor', () => {
    let navigation: typeof import('../../src/ts/modules/navigation')

    beforeEach(async () => {
      vi.resetModules()
      navigation = await import('../../src/ts/modules/navigation')
    })

    it('returns a cleanup function', () => {
      const cleanup = navigation.setupNavigationMonitor()
      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('is idempotent — second call returns a no-op', () => {
      const cleanup1 = navigation.setupNavigationMonitor()
      const cleanup2 = navigation.setupNavigationMonitor()

      // The first cleanup is the real one; the second is a no-op
      // Verify by checking that only one set of event listeners was added
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      // Calling the no-op cleanup does nothing observable
      cleanup2()
      expect(removeEventListenerSpy).not.toHaveBeenCalled()

      // Real cleanup removes listeners
      cleanup1()
      expect(removeEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
    })

    it('cleanup function disconnects observer and removes event listeners', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const cleanup = navigation.setupNavigationMonitor()
      cleanup()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function))
    })

    it('cleanup resets the monitorSetup guard, allowing re-setup', () => {
      const cleanup = navigation.setupNavigationMonitor()
      cleanup()

      // After cleanup, setupNavigationMonitor should produce a real cleanup again
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      const cleanup2 = navigation.setupNavigationMonitor()
      cleanup2()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function))
    })

    it('registers popstate and hashchange event listeners', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

      const cleanup = navigation.setupNavigationMonitor()

      expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function))

      cleanup()
    })

    it('calls uiController.handleUrlChange when URL changes to a protect page', async () => {
      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      // Simulate URL change
      setLocation('https://protect.local/protect/dashboard')

      // Trigger popstate to invoke handleURLChange
      window.dispatchEvent(new Event('popstate'))

      await vi.advanceTimersByTimeAsync(0)

      expect(mockUiController.handleUrlChange).toHaveBeenCalledWith(
        'https://protect.local/protect/devices',
        'https://protect.local/protect/dashboard',
      )

      cleanup()
    })

    it('calls dashboard.notifyDashboardState on URL change', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      setLocation('https://protect.local/protect/dashboard')
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      expect(dashboard.notifyDashboardState).toHaveBeenCalled()

      cleanup()
    })

    it('applies dashboard customizations when navigating to dashboard', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(true)
      vi.mocked(dashboard.initializeDashboard).mockResolvedValue(true)

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      setLocation('https://protect.local/protect/dashboard')
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      expect(dashboard.initializeDashboard).toHaveBeenCalled()

      cleanup()
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(false)
    })

    it('resets login attempts when navigating to dashboard', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(true)

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      setLocation('https://protect.local/protect/dashboard')
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      expect(auth.resetLoginAttempts).toHaveBeenCalled()

      cleanup()
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(false)
    })

    it('retries dashboard customizations when initializeDashboard returns false', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(true)
      vi.mocked(dashboard.initializeDashboard).mockReset()
      vi.mocked(dashboard.initializeDashboard).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      setLocation('https://protect.local/protect/dashboard')
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      // First call returned false
      expect(dashboard.initializeDashboard).toHaveBeenCalledTimes(1)

      // Advance past the retry delay (DASHBOARD_RETRY_DELAY_MS = 100 in our mock)
      await vi.advanceTimersByTimeAsync(100)

      expect(dashboard.initializeDashboard).toHaveBeenCalledTimes(2)

      cleanup()
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(false)
    })

    it('does not call uiController.handleUrlChange for non-protect pages', async () => {
      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      // Navigate to a non-protect page
      setLocation('https://protect.local/settings')
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      expect(mockUiController.handleUrlChange).not.toHaveBeenCalled()

      cleanup()
    })

    it('does nothing when URL has not actually changed', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      // Clear any calls that may have occurred during setup (MutationObserver
      // fires when DOM body is modified by setLocation or other setup code)
      vi.mocked(dashboard.notifyDashboardState).mockClear()

      // Trigger popstate without changing the URL
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      expect(dashboard.notifyDashboardState).not.toHaveBeenCalled()

      cleanup()
    })

    it('handles hashchange events the same as popstate', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      setLocation('https://protect.local/protect/dashboard')
      window.dispatchEvent(new Event('hashchange'))
      await vi.advanceTimersByTimeAsync(0)

      expect(dashboard.notifyDashboardState).toHaveBeenCalled()

      cleanup()
    })

    it('handles errors from dashboard.initializeDashboard gracefully', async () => {
      const dashboard = await import('../../src/ts/modules/dashboard')
      const utils = await import('../../src/ts/modules/utils')
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(true)
      vi.mocked(dashboard.initializeDashboard).mockRejectedValue(new Error('dashboard error'))

      setLocation('https://protect.local/protect/devices')
      const cleanup = navigation.setupNavigationMonitor()

      setLocation('https://protect.local/protect/dashboard')
      window.dispatchEvent(new Event('popstate'))
      await vi.advanceTimersByTimeAsync(0)

      expect(utils.logError).toHaveBeenCalledWith('Error applying dashboard customizations:', expect.any(Error))

      cleanup()
      vi.mocked(dashboard.isDashboardPage).mockReturnValue(false)
    })
  })

  describe('initializeCurrentPage', () => {
    let navigation: typeof import('../../src/ts/modules/navigation')

    beforeEach(async () => {
      vi.resetModules()
      navigation = await import('../../src/ts/modules/navigation')
    })

    it('returns true and initializes login page when on a login page', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(true)
      vi.mocked(auth.initializeLoginPage).mockReturnValue(true)

      const result = navigation.initializeCurrentPage()

      expect(auth.initializeLoginPage).toHaveBeenCalled()
      expect(result).toBe(true)

      vi.mocked(auth.isLoginPage).mockReturnValue(false)
    })

    it('returns false when login page initialization fails', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(true)
      vi.mocked(auth.initializeLoginPage).mockReturnValue(false)

      const result = navigation.initializeCurrentPage()

      expect(result).toBe(false)

      vi.mocked(auth.isLoginPage).mockReturnValue(false)
    })

    it('initializes dashboard page when URL contains /protect/dashboard', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      setLocation('https://protect.local/protect/dashboard')

      const result = navigation.initializeCurrentPage()

      expect(mockUi.initializeDashboardPage).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('returns true for other protect pages', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      setLocation('https://protect.local/protect/devices')

      const result = navigation.initializeCurrentPage()

      expect(result).toBe(true)
    })

    it('returns false for non-protect, non-login pages', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      setLocation('https://protect.local/settings')

      const result = navigation.initializeCurrentPage()

      expect(result).toBe(false)
    })

    it('prioritizes login page detection over dashboard', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(true)
      vi.mocked(auth.initializeLoginPage).mockReturnValue(true)

      // Even though the URL looks like a dashboard page, login check comes first
      setLocation('https://protect.local/protect/dashboard')

      const result = navigation.initializeCurrentPage()

      expect(auth.initializeLoginPage).toHaveBeenCalled()
      expect(mockUi.initializeDashboardPage).not.toHaveBeenCalled()
      expect(result).toBe(true)

      vi.mocked(auth.isLoginPage).mockReturnValue(false)
    })
  })

  describe('initializeWithPolling', () => {
    let navigation: typeof import('../../src/ts/modules/navigation')

    beforeEach(async () => {
      vi.resetModules()
      navigation = await import('../../src/ts/modules/navigation')
    })

    it('sets up navigation monitor and initializes current page', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      setLocation('https://protect.local/protect/dashboard')

      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

      navigation.initializeWithPolling()

      // Verify navigation monitor was set up
      expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function))
    })

    it('does not poll when page initializes successfully on first attempt', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      // On a protect page so initializeCurrentPage returns true immediately
      setLocation('https://protect.local/protect/devices')

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)

      navigation.initializeWithPolling()

      // Should NOT poll since initializeCurrentPage returned true
      expect(rafSpy).not.toHaveBeenCalled()

      rafSpy.mockRestore()
    })

    it('polls with requestAnimationFrame when page is not ready', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      // Non-protect page — initializeCurrentPage returns false
      setLocation('https://protect.local/settings')

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)

      navigation.initializeWithPolling()

      expect(rafSpy).toHaveBeenCalledWith(expect.any(Function))

      rafSpy.mockRestore()
    })

    it('stops polling once page is ready', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      setLocation('https://protect.local/settings')

      let rafCallback: FrameRequestCallback | null = null
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb
        return 1
      })

      navigation.initializeWithPolling()

      expect(rafSpy).toHaveBeenCalledTimes(1)
      rafSpy.mockClear()

      // Now the page becomes a protect page
      setLocation('https://protect.local/protect/devices')

      // Execute the stored rAF callback
      if (rafCallback) rafCallback(0)

      // Should not request another frame since initializeCurrentPage now returns true
      expect(rafSpy).not.toHaveBeenCalled()

      rafSpy.mockRestore()
    })

    it('continues polling until page becomes ready', async () => {
      const auth = await import('../../src/ts/modules/auth')
      vi.mocked(auth.isLoginPage).mockReturnValue(false)

      setLocation('https://protect.local/settings')

      const rafCallbacks: FrameRequestCallback[] = []
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })

      navigation.initializeWithPolling()

      // First rAF was called
      expect(rafCallbacks).toHaveLength(1)

      // Execute callback while still on settings page (returns false)
      rafCallbacks[0](0)

      // Should have requested another frame
      expect(rafCallbacks).toHaveLength(2)

      // Now navigate to protect page
      setLocation('https://protect.local/protect/devices')
      rafCallbacks[1](0)

      // Should NOT have requested another frame
      expect(rafCallbacks).toHaveLength(2)

      rafSpy.mockRestore()
    })
  })
})
