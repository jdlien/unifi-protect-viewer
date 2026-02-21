/**
 * Shared utility functions: DOM waiting, logging, element manipulation.
 */

import { DEFAULT_WAIT_TIMEOUT_MS, DEFAULT_WAIT_INTERVAL_MS } from './constants'

/**
 * Wait until a condition function returns true, polling at `interval` ms.
 * Rejects with a timeout error if the condition isn't met within `timeout` ms.
 */
export async function waitUntil(
  condition: () => boolean,
  timeout: number = DEFAULT_WAIT_TIMEOUT_MS,
  interval: number = DEFAULT_WAIT_INTERVAL_MS,
): Promise<void> {
  // Try the condition immediately first
  try {
    if (condition()) return
  } catch {
    // Ignore initial errors, will retry
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const intervalId = setInterval(() => {
      // Check if we've timed out
      if (Date.now() - startTime > timeout) {
        clearInterval(intervalId)
        return reject(new Error('Timeout waiting for condition'))
      }

      // Check the condition safely
      try {
        if (condition()) {
          clearInterval(intervalId)
          resolve()
        }
      } catch {
        // Don't fail on transient DOM errors, unless we time out
      }
    }, interval)
  })
}

/**
 * Utility function for logging that only logs in development mode
 */
export function log(...args: unknown[]): void {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args)
    }
  } catch (err) {
    console.error('Error in log function:', err)
  }
}

/**
 * Utility function for error logging.
 * Always logs errors but with different verbosity in production vs development.
 */
export function logError(message: string, error?: unknown): void {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.error(message, error)
    } else {
      // In production, log a simplified version without the stack trace
      console.error(message, error instanceof Error ? error.message : error)
    }
  } catch (err) {
    // Last resort fallback if even error logging fails
    console.error('Error in logError function:', err)
    try {
      console.error('Original error message:', message)
    } catch {
      // Silently fail if nothing works
    }
  }
}

/**
 * Utility function for warning logging.
 * Logs in development mode, simplified in production.
 */
export function logWarn(message: string, ...args: unknown[]): void {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.warn(message, ...args)
    } else {
      console.warn(message)
    }
  } catch (err) {
    console.error('Error in logWarn function:', err)
  }
}

/**
 * Wait for a specified amount of time
 */
export async function wait(amount: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, amount))
}

/**
 * Set a style property on an element
 */
export function setStyle(element: HTMLElement | null | undefined, style: string, value: string): void {
  if (!element) return
  ;(element.style as unknown as Record<string, string>)[style] = value
}

/**
 * Click an element
 */
export function clickElement(element: HTMLElement | null | undefined): void {
  if (!element) return

  if (element.click) {
    element.click()
  } else {
    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    })

    element.dispatchEvent(event)
  }
}

/**
 * Logger interface for electron-updater.
 * Implements the expected methods: info, warn, error, debug.
 */
export const logger = {
  info(...args: unknown[]): void {
    log('[INFO]', ...args)
  },
  warn(...args: unknown[]): void {
    log('[WARN]', ...args)
  },
  error(...args: unknown[]): void {
    logError('[ERROR]', args.length > 0 ? args[0] : 'Unknown error')
  },
  debug(...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development') {
      log('[DEBUG]', ...args)
    }
  },
}
