import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import Module from 'module'

// ── Entitlements plist regression tests ─────────────────────────────────────

describe('macOS entitlements (build/entitlements.mac.plist)', () => {
  const plistPath = path.resolve(__dirname, '../../build/entitlements.mac.plist')
  let plistContent: string

  beforeEach(() => {
    plistContent = fs.readFileSync(plistPath, 'utf-8')
  })

  it('contains disable-library-validation entitlement', () => {
    // CRITICAL: Without this entitlement, ad-hoc signed macOS builds crash on launch
    // with "mapping process and mapped file (non-platform) have different Team IDs"
    // because the main binary and Electron Framework have different code signatures.
    expect(plistContent).toContain('com.apple.security.cs.disable-library-validation')
  })

  it('contains allow-unsigned-executable-memory entitlement', () => {
    expect(plistContent).toContain('com.apple.security.cs.allow-unsigned-executable-memory')
  })

  it('contains allow-jit entitlement', () => {
    expect(plistContent).toContain('com.apple.security.cs.allow-jit')
  })
})

// ── afterPack.js signing logic tests ────────────────────────────────────────
//
// afterPack.js is a CJS module that require()'s @electron/fuses, child_process,
// and fs. Vitest's vi.mock() does NOT intercept CJS require() — we use the
// Module._resolveFilename + real mock file pattern from this project (see
// buttons.test.ts and test/__mocks__/electron.ts for the established pattern).
//
// IMPORTANT: To get the SAME mock instances as afterPack.js, we must access
// them via require() (CJS), not import (ESM). ESM imports go through Vite's
// separate module graph and create different instances.

// Intercept CJS require() for afterPack.js dependencies.
// The parent check uses 'afterPack' which matches both afterPack.js (source)
// and afterPack.test.ts (this test), ensuring both get the same mock instances.
const originalResolveFilename = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  const parentFile: string = parent?.filename || ''
  const isAfterPackScope = parentFile.includes('afterPack')

  if (request === '@electron/fuses') {
    return require.resolve('../__mocks__/electron-fuses.ts')
  }
  if (request === 'child_process' && isAfterPackScope) {
    return require.resolve('../__mocks__/child-process.ts')
  }
  if (request === 'fs' && isAfterPackScope) {
    return require.resolve('../__mocks__/fs-afterpack.ts')
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

afterAll(() => {
  ;(Module as any)._resolveFilename = originalResolveFilename
})

// Access mock instances via CJS require() — same resolution path as afterPack.js.
// Do NOT use ESM import here; it creates a separate Vite module instance.
function getMockFuses() {
  return require('@electron/fuses') as { flipFuses: ReturnType<typeof vi.fn> }
}

function getMockChildProcess() {
  return require('child_process') as { execFileSync: ReturnType<typeof vi.fn> }
}

function createDarwinContext(appOutDir = '/build/dist/mac-arm64') {
  return {
    electronPlatformName: 'darwin',
    appOutDir,
    packager: {
      appInfo: { productFilename: 'MyApp' },
      executableName: 'myapp',
      info: { projectDir: '/build' },
    },
  }
}

/** Extract codesign call args from execFileSync mock calls. */
function getCodesignCalls(): string[][] {
  return getMockChildProcess().execFileSync.mock.calls.map((call: any[]) => [...call[1]])
}

/**
 * Check if a codesign target path ends with .app (not just contains it).
 * Framework paths like .../MyApp.app/Contents/Frameworks/Foo.framework
 * contain ".app" but don't END with it — using includes() would false-positive.
 */
function targetIsApp(targetPath: string): boolean {
  return targetPath.endsWith('.app')
}

function targetIsFramework(targetPath: string): boolean {
  return targetPath.endsWith('.framework')
}

// Resolve once — used to clear the require cache between tests
const afterPackPath = require.resolve('../../scripts/afterPack.js')

describe('afterPack hook (scripts/afterPack.js)', () => {
  let afterPack: (ctx: any) => Promise<void>

  beforeEach(() => {
    getMockFuses().flipFuses.mockClear()
    getMockChildProcess().execFileSync.mockClear()

    // Clear afterPack from module cache so each test gets a fresh evaluation.
    // Use require() (not await import()) so afterPack.js shares the same CJS
    // module cache as its dependencies — ensuring it gets our mock instances.
    delete require.cache[afterPackPath]
    afterPack = require(afterPackPath)
  })

  describe('macOS signing', () => {
    it('does NOT use --deep flag (prevents Team ID mismatch)', async () => {
      await afterPack(createDarwinContext())
      const calls = getCodesignCalls()

      expect(calls.length).toBeGreaterThan(0)
      for (const args of calls) {
        expect(args).not.toContain('--deep')
      }
    })

    it('signs frameworks before helpers before main app (inside-out order)', async () => {
      await afterPack(createDarwinContext())
      const calls = getCodesignCalls()
      const signedPaths = calls.map((args) => args[args.length - 1])

      const frameworkIndices = signedPaths.map((p, i) => (targetIsFramework(p) ? i : -1)).filter((i) => i >= 0)
      const helperIndices = signedPaths
        .map((p, i) => (targetIsApp(p) && p.includes('Helper') ? i : -1))
        .filter((i) => i >= 0)
      const mainAppIndices = signedPaths.map((p, i) => (p.endsWith('MyApp.app') ? i : -1)).filter((i) => i >= 0)

      expect(frameworkIndices.length).toBeGreaterThan(0)
      expect(helperIndices.length).toBeGreaterThan(0)
      expect(mainAppIndices).toHaveLength(1)

      // All frameworks signed before any helper
      expect(Math.max(...frameworkIndices)).toBeLessThan(Math.min(...helperIndices))
      // Main app signed after all helpers
      expect(mainAppIndices[0]).toBeGreaterThan(Math.max(...helperIndices))
    })

    it('applies entitlements to main app and helpers but not frameworks', async () => {
      await afterPack(createDarwinContext())

      for (const args of getCodesignCalls()) {
        const target = args[args.length - 1]
        const hasEntitlements = args.includes('--entitlements')

        if (targetIsFramework(target)) {
          expect(hasEntitlements).toBe(false)
        } else if (targetIsApp(target)) {
          expect(hasEntitlements).toBe(true)
        }
      }
    })

    it('uses hardened runtime flag on main app and helpers', async () => {
      await afterPack(createDarwinContext())

      const appCalls = getCodesignCalls().filter((args) => targetIsApp(args[args.length - 1]))
      expect(appCalls.length).toBeGreaterThan(0)

      for (const args of appCalls) {
        const optionsIdx = args.indexOf('--options')
        expect(optionsIdx).toBeGreaterThanOrEqual(0)
        expect(args[optionsIdx + 1]).toBe('runtime')
      }
    })

    it('references the entitlements plist from the project build dir', async () => {
      await afterPack(createDarwinContext())

      const entitlementsPaths = getCodesignCalls()
        .filter((args) => args.includes('--entitlements'))
        .map((args) => args[args.indexOf('--entitlements') + 1])

      expect(entitlementsPaths.length).toBeGreaterThan(0)
      for (const p of entitlementsPaths) {
        expect(p).toContain(path.join('build', 'entitlements.mac.plist'))
      }
    })

    it('skips signing for universal build temp dirs', async () => {
      await afterPack(createDarwinContext('/build/dist/mac-arm64-temp'))

      expect(getCodesignCalls()).toHaveLength(0)
      // Fuses should still be flipped
      expect(getMockFuses().flipFuses).toHaveBeenCalled()
    })
  })

  describe('non-macOS platforms', () => {
    it('does not attempt codesign on win32', async () => {
      await afterPack({
        electronPlatformName: 'win32',
        appOutDir: '/build/dist/win-unpacked',
        packager: {
          appInfo: { productFilename: 'MyApp' },
          executableName: 'myapp',
          info: { projectDir: '/build' },
        },
      })

      expect(getCodesignCalls()).toHaveLength(0)
      expect(getMockFuses().flipFuses).toHaveBeenCalled()
    })

    it('does not attempt codesign on linux', async () => {
      await afterPack({
        electronPlatformName: 'linux',
        appOutDir: '/build/dist/linux-unpacked',
        packager: {
          appInfo: { productFilename: 'MyApp' },
          executableName: 'myapp',
          info: { projectDir: '/build' },
        },
      })

      expect(getCodesignCalls()).toHaveLength(0)
      expect(getMockFuses().flipFuses).toHaveBeenCalled()
    })
  })

  describe('fuse configuration', () => {
    it('flips all required security fuses', async () => {
      await afterPack(createDarwinContext())

      const { flipFuses } = getMockFuses()
      expect(flipFuses).toHaveBeenCalledTimes(1)
      const fuseConfig = flipFuses.mock.calls[0][1]

      expect(fuseConfig.RunAsNode).toBe(false)
      expect(fuseConfig.EnableNodeCliInspectArguments).toBe(false)
      expect(fuseConfig.EnableEmbeddedAsarIntegrityValidation).toBe(true)
      expect(fuseConfig.OnlyLoadAppFromAsar).toBe(true)
      expect(fuseConfig.GrantFileProtocolExtraPrivileges).toBe(false)
    })
  })
})
