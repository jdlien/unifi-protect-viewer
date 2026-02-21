/**
 * Module to handle timeouts consistently across pages
 */

// Store active timeouts by purpose (number because window.setTimeout returns number)
const activeTimeouts: Record<string, number | null> = {
  connection: null,
}

/**
 * Set a timeout and store its ID
 */
export function setTrackedTimeout(purpose: string, callback: () => void, duration: number): number {
  // Clear any existing timeout for this purpose
  clearTimeout(purpose)

  // Set the new timeout
  const timeoutId = window.setTimeout(() => {
    // Remove reference when timeout executes
    activeTimeouts[purpose] = null
    callback()
  }, duration)

  // Store the timeout ID
  activeTimeouts[purpose] = timeoutId

  return timeoutId
}

/**
 * Clear a timeout by purpose
 */
export function clearTimeout(purpose: string): void {
  if (activeTimeouts[purpose]) {
    window.clearTimeout(activeTimeouts[purpose]!)
    activeTimeouts[purpose] = null
  }
}

/**
 * Clear all active timeouts
 */
export function clearAllTimeouts(): void {
  Object.keys(activeTimeouts).forEach((purpose) => {
    clearTimeout(purpose)
  })
}
