import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const utils = require('../../src/js/modules/utils')

describe('utils', () => {
  describe('waitUntil', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('resolves immediately when condition is true', async () => {
      await utils.waitUntil(() => true)
    })

    it('resolves when condition becomes true', async () => {
      let ready = false
      const promise = utils.waitUntil(() => ready, 5000, 50)

      // Condition is false initially
      await vi.advanceTimersByTimeAsync(100)

      // Make condition true
      ready = true
      await vi.advanceTimersByTimeAsync(50)

      await promise
    })

    it('rejects on timeout', async () => {
      const promise = utils.waitUntil(() => false, 100, 20)

      // Catch the rejection before advancing timers to prevent unhandled rejection
      const resultPromise = promise.catch((err) => err)

      await vi.advanceTimersByTimeAsync(200)

      const error = await resultPromise
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Timeout waiting for condition')
    })

    it('ignores transient errors in condition', async () => {
      let callCount = 0
      const condition = () => {
        callCount++
        if (callCount < 3) throw new Error('transient')
        return true
      }

      const promise = utils.waitUntil(condition, 5000, 20)
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(callCount).toBeGreaterThanOrEqual(3)
    })

    it('uses default timeout and interval', async () => {
      // Just verify it doesn't throw with default args
      let ready = false
      const promise = utils.waitUntil(() => ready)

      ready = true
      await vi.advanceTimersByTimeAsync(20)
      await promise
    })
  })

  describe('wait', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('resolves after the specified time', async () => {
      const promise = utils.wait(100)
      await vi.advanceTimersByTimeAsync(100)
      await promise
    })
  })

  describe('setStyle', () => {
    it('sets a style property on an element', () => {
      const el = document.createElement('div')
      utils.setStyle(el, 'display', 'none')
      expect(el.style.display).toBe('none')
    })

    it('does nothing if element is null', () => {
      // Should not throw
      utils.setStyle(null, 'display', 'none')
    })

    it('does nothing if element is undefined', () => {
      utils.setStyle(undefined, 'display', 'none')
    })
  })

  describe('clickElement', () => {
    it('calls click() on element', () => {
      const el = document.createElement('button')
      const clickSpy = vi.spyOn(el, 'click')
      utils.clickElement(el)
      expect(clickSpy).toHaveBeenCalled()
    })

    it('does nothing if element is null', () => {
      utils.clickElement(null)
    })

    it('dispatches MouseEvent if element has no click method', () => {
      const el = document.createElement('div')
      el.click = undefined
      let clicked = false
      el.addEventListener('click', () => {
        clicked = true
      })
      utils.clickElement(el)
      expect(clicked).toBe(true)
    })
  })

  describe('log', () => {
    let originalEnv

    beforeEach(() => {
      originalEnv = process.env.NODE_ENV
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
      vi.restoreAllMocks()
    })

    it('logs in development mode', () => {
      process.env.NODE_ENV = 'development'
      utils.log('test message')
      expect(console.log).toHaveBeenCalledWith('test message')
    })

    it('does not log in production mode', () => {
      process.env.NODE_ENV = 'production'
      utils.log('test message')
      expect(console.log).not.toHaveBeenCalled()
    })
  })

  describe('logError', () => {
    let originalEnv

    beforeEach(() => {
      originalEnv = process.env.NODE_ENV
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
      vi.restoreAllMocks()
    })

    it('logs full error in development mode', () => {
      process.env.NODE_ENV = 'development'
      const error = new Error('test error')
      utils.logError('Something failed:', error)
      expect(console.error).toHaveBeenCalledWith('Something failed:', error)
    })

    it('logs simplified error in production mode', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('test error')
      utils.logError('Something failed:', error)
      expect(console.error).toHaveBeenCalledWith('Something failed:', 'test error')
    })
  })

  describe('logWarn', () => {
    let originalEnv

    beforeEach(() => {
      originalEnv = process.env.NODE_ENV
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
      vi.restoreAllMocks()
    })

    it('logs with args in development mode', () => {
      process.env.NODE_ENV = 'development'
      utils.logWarn('warning:', 'details')
      expect(console.warn).toHaveBeenCalledWith('warning:', 'details')
    })

    it('logs simplified in production mode', () => {
      process.env.NODE_ENV = 'production'
      utils.logWarn('warning:', 'details')
      expect(console.warn).toHaveBeenCalledWith('warning:')
    })
  })

  describe('logger', () => {
    let originalEnv

    beforeEach(() => {
      originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
      vi.restoreAllMocks()
    })

    it('has info, warn, error, debug methods', () => {
      expect(utils.logger.info).toBeDefined()
      expect(utils.logger.warn).toBeDefined()
      expect(utils.logger.error).toBeDefined()
      expect(utils.logger.debug).toBeDefined()
    })

    it('info logs with [INFO] prefix', () => {
      utils.logger.info('test')
      expect(console.log).toHaveBeenCalledWith('[INFO]', 'test')
    })

    it('warn logs with [WARN] prefix', () => {
      utils.logger.warn('test')
      expect(console.log).toHaveBeenCalledWith('[WARN]', 'test')
    })
  })
})
