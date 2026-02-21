import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Module from 'module'
import path from 'path'

// ---------------------------------------------------------------------------
// CJS require() interception
// ---------------------------------------------------------------------------
// auth.ts uses `require('electron')` at the top level and lazy
// `require('./dashboard')` and `require('./ui')` inside setupLoginSuccessMonitor.
// Vitest's vi.mock only intercepts ESM imports, so we use Module._resolveFilename
// to redirect CJS require calls to mock objects.

const mockDashboard = {
  waitForDashboardReady: vi.fn().mockResolvedValue(true),
}

const mockUi = {
  handleLiveView: vi.fn(),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalResolveFilename = (Module as any)._resolveFilename
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'electron') {
    return require.resolve('../__mocks__/electron.ts')
  }

  if (request === './dashboard' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__dashboard_auth__'
  }

  if (request === './ui' && parent?.filename?.includes(path.join('src', 'ts', 'modules'))) {
    return '__mock__ui_auth__'
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Register sentinel paths in Node's require cache
// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__dashboard_auth__'] = {
  id: '__mock__dashboard_auth__',
  filename: '__mock__dashboard_auth__',
  loaded: true,
  exports: mockDashboard,
} as unknown as NodeModule

// eslint-disable-next-line @typescript-eslint/no-require-imports
require.cache['__mock__ui_auth__'] = {
  id: '__mock__ui_auth__',
  filename: '__mock__ui_auth__',
  loaded: true,
  exports: mockUi,
} as unknown as NodeModule

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the mocked ipcRenderer from the intercepted electron module. */
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

/** Set up a basic login form in the DOM. */
function createLoginForm(): void {
  document.body.innerHTML = `
    <form>
      <input name="username" type="text" />
      <input type="password" />
      <button type="submit">Login</button>
    </form>
  `
}

/** Set up a login form with a remember me checkbox. */
function createLoginFormWithRememberMe(): void {
  document.body.innerHTML = `
    <form>
      <input name="username" type="text" />
      <input type="password" />
      <input id="rememberMe" type="checkbox" />
      <button type="submit">Login</button>
    </form>
  `
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any

describe('auth', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
    setLocation('https://protect.local/login')

    const ipc = getMockIpcRenderer()
    ipc.invoke.mockReset()
    ipc.invoke.mockResolvedValue({})
    ipc.send.mockClear()

    mockDashboard.waitForDashboardReady.mockReset()
    mockDashboard.waitForDashboardReady.mockResolvedValue(true)
    mockUi.handleLiveView.mockClear()

    if (!auth) {
      const mod = await import('../../src/ts/modules/auth')
      auth = mod
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

  // ─── isLoginPage ────────────────────────────────────────────────────

  describe('isLoginPage', () => {
    it('returns true when URL contains "login"', () => {
      setLocation('https://protect.local/login')
      expect(auth.isLoginPage()).toBe(true)
    })

    it('returns true when URL contains "signin"', () => {
      setLocation('https://protect.local/signin')
      expect(auth.isLoginPage()).toBe(true)
    })

    it('returns true when URL contains "auth"', () => {
      setLocation('https://protect.local/auth')
      expect(auth.isLoginPage()).toBe(true)
    })

    it('returns true when URL contains "/ui/login"', () => {
      setLocation('https://protect.local/ui/login')
      expect(auth.isLoginPage()).toBe(true)
    })

    it('returns true when login form elements exist in the DOM', () => {
      setLocation('https://protect.local/protect/some-page')
      createLoginForm()
      expect(auth.isLoginPage()).toBe(true)
    })

    it('returns false when URL is not a login page and no form is present', () => {
      setLocation('https://protect.local/protect/dashboard')
      document.body.innerHTML = '<div>Dashboard</div>'
      expect(auth.isLoginPage()).toBe(false)
    })

    it('returns false when only username field exists without password', () => {
      setLocation('https://protect.local/protect/settings')
      document.body.innerHTML = `
        <form>
          <input name="username" type="text" />
          <button type="submit">Submit</button>
        </form>
      `
      expect(auth.isLoginPage()).toBe(false)
    })

    it('returns false when only password field exists without username', () => {
      setLocation('https://protect.local/protect/settings')
      document.body.innerHTML = `
        <form>
          <input type="password" />
          <button type="submit">Submit</button>
        </form>
      `
      expect(auth.isLoginPage()).toBe(false)
    })

    it('detects login form with email type input as username', () => {
      setLocation('https://protect.local/protect/some-page')
      document.body.innerHTML = `
        <form>
          <input type="email" />
          <input type="password" />
          <button type="submit">Login</button>
        </form>
      `
      expect(auth.isLoginPage()).toBe(true)
    })

    it('detects login button by text content', () => {
      setLocation('https://protect.local/protect/some-page')
      document.body.innerHTML = `
        <form>
          <input name="username" type="text" />
          <input type="password" />
          <button>Login</button>
        </form>
      `
      expect(auth.isLoginPage()).toBe(true)
    })
  })

  // ─── attemptLogin ───────────────────────────────────────────────────

  describe('attemptLogin', () => {
    it('returns false when max login attempts exceeded', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 3,
            loginAttemptsResetTime: Date.now() + 1_800_000,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginForm()
      const result = await auth.attemptLogin()
      expect(result).toBe(false)
    })

    it('returns false when no credentials are configured', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({ loginAttempts: 0, loginAttemptsResetTime: 0 })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginForm()
      const result = await auth.attemptLogin()
      expect(result).toBe(false)
    })

    it('fills in username and password fields and clicks submit', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 0,
            loginAttemptsResetTime: 0,
            username: 'admin',
            password: 'secret123',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginForm()
      const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement
      const clickSpy = vi.spyOn(submitBtn, 'click')

      const result = await auth.attemptLogin()

      expect(result).toBe(true)

      const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement
      const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
      expect(usernameInput.value).toBe('admin')
      expect(passwordInput.value).toBe('secret123')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('checks the remember me checkbox if present and unchecked', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 0,
            loginAttemptsResetTime: 0,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginFormWithRememberMe()
      const result = await auth.attemptLogin()

      expect(result).toBe(true)
      const checkbox = document.querySelector('input#rememberMe') as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('does not touch remember me checkbox if already checked', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 0,
            loginAttemptsResetTime: 0,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginFormWithRememberMe()
      const checkbox = document.querySelector('input#rememberMe') as HTMLInputElement
      checkbox.checked = true

      const dispatchSpy = vi.spyOn(checkbox, 'dispatchEvent')

      await auth.attemptLogin()

      // Should not have dispatched events on the checkbox since it was already checked
      expect(dispatchSpy).not.toHaveBeenCalled()
    })

    it('returns false when form elements are missing', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 0,
            loginAttemptsResetTime: 0,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      // Empty DOM — no form elements
      document.body.innerHTML = '<div>No form here</div>'

      const result = await auth.attemptLogin()
      expect(result).toBe(false)
    })

    it('increments login attempts in the store', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 1,
            loginAttemptsResetTime: Date.now() + 1_800_000,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginForm()
      await auth.attemptLogin()

      expect(ipc.invoke).toHaveBeenCalledWith(
        'configSavePartial',
        expect.objectContaining({
          loginAttempts: 2,
        }),
      )
    })

    it('dispatches input and change events on filled fields', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 0,
            loginAttemptsResetTime: 0,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginForm()
      const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement
      const events: string[] = []
      usernameInput.addEventListener('input', () => events.push('input'))
      usernameInput.addEventListener('change', () => events.push('change'))

      await auth.attemptLogin()

      expect(events).toContain('input')
      expect(events).toContain('change')
    })

    it('returns false and logs error on unexpected exception', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockRejectedValue(new Error('IPC failure'))

      const result = await auth.attemptLogin()
      expect(result).toBe(false)
    })
  })

  // ─── resetLoginAttempts ─────────────────────────────────────────────

  describe('resetLoginAttempts', () => {
    it('resets login attempts to zero via configSavePartial', async () => {
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockResolvedValue(undefined)

      await auth.resetLoginAttempts()

      expect(ipc.invoke).toHaveBeenCalledWith('configSavePartial', {
        loginAttempts: 0,
        loginAttemptsResetTime: 0,
      })
    })
  })

  // ─── initializeLoginPage ────────────────────────────────────────────

  describe('initializeLoginPage', () => {
    it('returns true and calls attemptLogin when password input exists in a form', async () => {
      createLoginForm()

      // Mock configLoad to return credentials so attemptLogin does something
      const ipc = getMockIpcRenderer()
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 0,
            loginAttemptsResetTime: 0,
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      const result = auth.initializeLoginPage()
      expect(result).toBe(true)
    })

    it('returns false when no password input exists in a form', () => {
      document.body.innerHTML = '<div>No form</div>'
      const result = auth.initializeLoginPage()
      expect(result).toBe(false)
    })

    it('returns false when password input exists outside a form', () => {
      document.body.innerHTML = '<div><input type="password" /></div>'
      const result = auth.initializeLoginPage()
      expect(result).toBe(false)
    })
  })

  // ─── Login attempt reset time ───────────────────────────────────────

  describe('login attempt reset time', () => {
    it('resets attempts when the reset time has expired', async () => {
      const ipc = getMockIpcRenderer()
      // The reset time is in the past, so attempts should be reset
      ipc.invoke.mockImplementation((channel: string) => {
        if (channel === 'configLoad') {
          return Promise.resolve({
            loginAttempts: 3,
            loginAttemptsResetTime: Date.now() - 1000, // expired
            username: 'admin',
            password: 'pass',
          })
        }
        if (channel === 'configSavePartial') return Promise.resolve()
        return Promise.resolve({})
      })

      createLoginForm()
      const result = await auth.attemptLogin()

      // Should succeed because attempts were reset (expired timer)
      expect(result).toBe(true)
    })
  })
})
