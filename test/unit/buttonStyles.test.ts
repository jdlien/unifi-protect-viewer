import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Tests for buttonStyles module
// ---------------------------------------------------------------------------
// buttonStyles.ts has only ESM imports (utils.ts and constants.ts), so no
// Module._resolveFilename interception is needed. The electron mock from
// test/setup.ts covers any transitive electron references.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let buttonStyles: any

describe('buttonStyles', () => {
  beforeEach(async () => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    vi.useFakeTimers()

    if (!buttonStyles) {
      const mod = await import('../../src/ts/modules/buttonStyles')
      buttonStyles = mod
    }
  })

  afterEach(() => {
    buttonStyles.stopStyleChecker()
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  // ─── BUTTON_STYLES constant ─────────────────────────────────────────

  describe('BUTTON_STYLES', () => {
    it('exports a non-empty CSS string', () => {
      expect(typeof buttonStyles.BUTTON_STYLES).toBe('string')
      expect(buttonStyles.BUTTON_STYLES.length).toBeGreaterThan(0)
    })

    it('contains expected CSS class selectors', () => {
      expect(buttonStyles.BUTTON_STYLES).toContain('.header-button')
      expect(buttonStyles.BUTTON_STYLES).toContain('.custom-nav-button')
      expect(buttonStyles.BUTTON_STYLES).toContain('.dashboard-button')
    })
  })

  // ─── injectButtonStyles ─────────────────────────────────────────────

  describe('injectButtonStyles', () => {
    it('creates a style element in the document head', () => {
      buttonStyles.injectButtonStyles()

      const styleEl = document.getElementById('unifi-protect-viewer-button-styles')
      expect(styleEl).not.toBeNull()
      expect(styleEl!.tagName).toBe('STYLE')
    })

    it('style element contains the BUTTON_STYLES CSS', () => {
      buttonStyles.injectButtonStyles()

      const styleEl = document.getElementById('unifi-protect-viewer-button-styles')
      expect(styleEl!.textContent).toBe(buttonStyles.BUTTON_STYLES)
    })

    it('inserts the style element as the first child of head', () => {
      // Add an existing element to head so we can verify insertion order
      const existingStyle = document.createElement('style')
      existingStyle.id = 'existing-style'
      document.head.appendChild(existingStyle)

      buttonStyles.injectButtonStyles()

      expect(document.head.firstElementChild!.id).toBe('unifi-protect-viewer-button-styles')
    })

    it('appends to head when head is empty', () => {
      document.head.innerHTML = ''

      buttonStyles.injectButtonStyles()

      const styleEl = document.getElementById('unifi-protect-viewer-button-styles')
      expect(styleEl).not.toBeNull()
      expect(document.head.contains(styleEl)).toBe(true)
    })

    it('is idempotent — calling twice does not duplicate styles', () => {
      buttonStyles.injectButtonStyles()
      buttonStyles.injectButtonStyles()

      const styleEls = document.querySelectorAll('#unifi-protect-viewer-button-styles')
      expect(styleEls.length).toBe(1)
    })

    it('is idempotent — second call is a no-op when style already exists', () => {
      buttonStyles.injectButtonStyles()
      const firstEl = document.getElementById('unifi-protect-viewer-button-styles')

      buttonStyles.injectButtonStyles()
      const secondEl = document.getElementById('unifi-protect-viewer-button-styles')

      // Same element reference — no replacement occurred
      expect(firstEl).toBe(secondEl)
    })

    it('does not throw if document.head operations fail', () => {
      // Simulate a broken head by temporarily stubbing createElement
      const origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'style') throw new Error('DOM error')
        return origCreateElement(tag)
      })

      // Should not throw — error is caught internally
      expect(() => buttonStyles.injectButtonStyles()).not.toThrow()
    })
  })

  // ─── setupStyleChecker ──────────────────────────────────────────────

  describe('setupStyleChecker', () => {
    it('starts a periodic interval that checks for missing styles', () => {
      buttonStyles.injectButtonStyles()
      buttonStyles.setupStyleChecker()

      // Remove the styles to simulate the app removing them
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()
      expect(document.getElementById('unifi-protect-viewer-button-styles')).toBeNull()

      // Advance past the style checker interval (STYLE_CHECKER_INTERVAL_MS = 5000)
      vi.advanceTimersByTime(5000)

      // Styles should have been re-injected
      expect(document.getElementById('unifi-protect-viewer-button-styles')).not.toBeNull()
    })

    it('does not re-inject styles when they are still present', () => {
      buttonStyles.injectButtonStyles()
      const originalEl = document.getElementById('unifi-protect-viewer-button-styles')

      buttonStyles.setupStyleChecker()

      // Advance past the check interval
      vi.advanceTimersByTime(5000)

      // The same element should still be there (not replaced)
      const currentEl = document.getElementById('unifi-protect-viewer-button-styles')
      expect(currentEl).toBe(originalEl)
    })

    it('calling setupStyleChecker twice replaces the previous interval', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

      buttonStyles.setupStyleChecker()
      buttonStyles.setupStyleChecker()

      // The first interval should have been cleared when the second was set up
      // stopStyleChecker is called at the start of setupStyleChecker
      expect(clearIntervalSpy).toHaveBeenCalled()
    })

    it('re-injects styles on every interval tick when they keep getting removed', () => {
      buttonStyles.setupStyleChecker()

      // First tick — no styles exist, should inject
      vi.advanceTimersByTime(5000)
      expect(document.getElementById('unifi-protect-viewer-button-styles')).not.toBeNull()

      // Remove them again
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      // Second tick — should re-inject
      vi.advanceTimersByTime(5000)
      expect(document.getElementById('unifi-protect-viewer-button-styles')).not.toBeNull()
    })
  })

  // ─── stopStyleChecker ──────────────────────────────────────────────

  describe('stopStyleChecker', () => {
    it('clears the interval so styles are no longer re-injected', () => {
      buttonStyles.injectButtonStyles()
      buttonStyles.setupStyleChecker()

      // Stop the checker
      buttonStyles.stopStyleChecker()

      // Remove styles
      document.getElementById('unifi-protect-viewer-button-styles')?.remove()

      // Advance past the check interval
      vi.advanceTimersByTime(10_000)

      // Styles should NOT have been re-injected
      expect(document.getElementById('unifi-protect-viewer-button-styles')).toBeNull()
    })

    it('is safe to call when no checker is running', () => {
      expect(() => buttonStyles.stopStyleChecker()).not.toThrow()
    })

    it('is safe to call multiple times', () => {
      buttonStyles.setupStyleChecker()

      expect(() => {
        buttonStyles.stopStyleChecker()
        buttonStyles.stopStyleChecker()
      }).not.toThrow()
    })

    it('calling clearInterval with the interval handle', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

      buttonStyles.setupStyleChecker()
      buttonStyles.stopStyleChecker()

      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})
