import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const timeouts = require('../../src/js/modules/timeouts')

describe('timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    timeouts.clearAllTimeouts()
  })

  afterEach(() => {
    timeouts.clearAllTimeouts()
    vi.useRealTimers()
  })

  describe('setTrackedTimeout', () => {
    it('executes callback after duration', () => {
      const callback = vi.fn()
      timeouts.setTrackedTimeout('test', callback, 1000)

      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      expect(callback).toHaveBeenCalledOnce()
    })

    it('returns a timeout ID', () => {
      const id = timeouts.setTrackedTimeout('test', vi.fn(), 1000)
      expect(id).toBeDefined()
    })

    it('clears previous timeout for the same purpose', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      timeouts.setTrackedTimeout('test', callback1, 1000)
      timeouts.setTrackedTimeout('test', callback2, 1000)

      vi.advanceTimersByTime(1000)
      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledOnce()
    })
  })

  describe('clearTimeout', () => {
    it('prevents a tracked timeout from firing', () => {
      const callback = vi.fn()
      timeouts.setTrackedTimeout('test', callback, 1000)

      timeouts.clearTimeout('test')

      vi.advanceTimersByTime(1000)
      expect(callback).not.toHaveBeenCalled()
    })

    it('does nothing for an unknown purpose', () => {
      // Should not throw
      timeouts.clearTimeout('nonexistent')
    })
  })

  describe('clearAllTimeouts', () => {
    it('clears all tracked timeouts', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      timeouts.setTrackedTimeout('a', callback1, 1000)
      timeouts.setTrackedTimeout('b', callback2, 2000)

      timeouts.clearAllTimeouts()

      vi.advanceTimersByTime(3000)
      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
    })
  })
})
