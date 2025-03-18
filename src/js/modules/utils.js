/**
 * Wait until a condition is met
 * @param {Function} condition - Condition function that returns a boolean
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>} - Resolves to true if condition is met, false if timed out
 */
async function waitUntil(condition, timeout = 20000, interval = 100) {
  return new Promise((resolve, reject) => {
    // If condition is already true, resolve immediately
    if (condition()) {
      return resolve(true)
    }

    // Set up the interval check
    const intervalId = setInterval(() => {
      try {
        if (condition()) {
          clearInterval(intervalId)
          clearTimeout(timeoutId)
          resolve(true)
        }
      } catch (error) {
        clearInterval(intervalId)
        clearTimeout(timeoutId)
        reject(error)
      }
    }, interval)

    // Set up the timeout
    const timeoutId =
      timeout !== -1
        ? setTimeout(() => {
            clearInterval(intervalId)
            resolve(false) // Resolve with false rather than rejecting
          }, timeout)
        : null
  })
}

/**
 * Wait for a specified amount of time
 * @param {number} amount - Time to wait in milliseconds
 * @returns {Promise<void>}
 */
async function wait(amount) {
  return new Promise((resolve) => setTimeout(resolve, amount))
}

/**
 * Wait for live view to be ready by checking for various loading indicators
 * @returns {Promise<boolean>} - Resolves to true when ready
 */
async function waitForLiveViewReady() {
  // Wait for the loader screen to disappear
  await waitUntil(() => document.querySelectorAll('[data-testid="loader-screen"]').length === 0)

  // Wait for the skeleton view to disappear
  await waitUntil(() => {
    const skeletonViews = document.querySelectorAll('[class*="Pages__LoadingOverlay"]')
    return skeletonViews.length === 0
  })

  // Wait for key elements to be present
  await waitUntil(
    () =>
      document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0 &&
      document.querySelectorAll('[class^=dashboard__Content]').length > 0 &&
      document.querySelectorAll('[data-testid="option"]').length > 0,
  )

  // Additional check: wait for any loading indicators to disappear
  await waitUntil(() => {
    const loadingElements = document.querySelectorAll('[class*="loading"], [class*="Loading"]')
    return loadingElements.length === 0
  })

  // Wait a short moment to ensure any final rendering is complete
  await wait(500)

  return true
}

/**
 * Set a style property on an element
 * @param {HTMLElement} element - The element to style
 * @param {string} style - The CSS property to set
 * @param {string} value - The value to set
 */
function setStyle(element, style, value) {
  if (!element) return
  element.style[style] = value
}

/**
 * Click an element
 * @param {HTMLElement} element - The element to click
 */
function clickElement(element) {
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

module.exports = {
  waitUntil,
  wait,
  waitForLiveViewReady,
  setStyle,
  clickElement,
}
