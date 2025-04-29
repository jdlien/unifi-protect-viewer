const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')
const buttons = require('./buttons')

// Import utility functions that UI customization depends on
const utils = require('./utils')
// Import button styles module
const buttonStyles = require('./buttonStyles')

/**
 * Fullscreen view modification function to customize the LiveView UI.
 * Only compatible with UniFi Protect 5.0 and later.
 */
async function handleLiveView() {
  // wait until liveview is present
  // utils.logger.debug('Waiting for liveview to be present')
  await utils.waitUntil(() => document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0)

  // close all modals if needed
  if (document.getElementsByClassName('ReactModalPortal').length > 0) {
    Array.from(document.getElementsByClassName('ReactModalPortal')).forEach((modalPortal) => {
      if (modalPortal.getElementsByTagName('svg').length > 0 && modalPortal.getElementsByTagName('svg')[0]) {
        utils.clickElement(modalPortal.getElementsByTagName('svg')[0])
      }
    })
  }

  // wait until modals are closed
  await utils.waitUntil(
    () =>
      Array.from(document.getElementsByClassName('ReactModalPortal'))
        .map((e) => e.children.length === 0)
        .filter((e) => e === false).length === 0,
  )

  utils.setStyle(document.getElementsByTagName('body')[0], 'background', 'black')

  // Apply navigation visibility based on user preferences - now uses the centralized function
  await applyUserNavigationPreferences()

  utils.setStyle(document.querySelectorAll('[class^=dashboard__Content]')[0], 'gap', '0')
  utils.setStyle(document.querySelectorAll('[class^=dashboard__Content]')[0], 'padding', '0')
  utils.setStyle(document.querySelectorAll('[class^=liveView__FullscreenWrapper]')[0], 'background-color', 'black')
  utils.setStyle(
    document.querySelectorAll('[class^=liveView__LiveViewWrapper]')[0].querySelectorAll('[class^=common__Widget]')[0],
    'border',
    '0',
  )
  utils.setStyle(
    document
      .querySelectorAll('[class^=liveView__LiveViewWrapper]')[0]
      .querySelectorAll('[class^=dashboard__Scrollable]')[0],
    'paddingBottom',
    '0',
  )

  // For grids other than "All Cameras", we adjust the aspect ratio of the ViewPortsWrapper to match so that
  // they all fit within the window without cropping or needing to scroll
  // The "All Cameras" view is designed to be scrolled, so we don't adjust it
  if (!document.URL.includes('/protect/dashboard/all')) {
    // Get the aspect ratio of the ViewPortsWrapper
    let viewPortAspectRatio = 16 / 9

    const viewPortsWrapper = document.querySelectorAll('[class^=liveview__ViewportsWrapper]')[0]
    if (viewPortsWrapper) {
      viewPortAspectRatio = viewPortsWrapper.offsetWidth / viewPortsWrapper.offsetHeight
    }

    // Set the max width of the ViewPortsWrapper to maintain the aspect ratio
    utils.setStyle(
      document
        .querySelectorAll('[class^=liveView__LiveViewWrapper]')[0]
        .querySelectorAll('[class^=liveview__ViewportsWrapper]')[0],
      'maxWidth',
      `calc(100vh * ${viewPortAspectRatio})`,
    )
  }

  // wait until remove option buttons are visible
  await utils.waitUntil(() => document.querySelectorAll('[data-testid="option"]').length > 0)

  // Handle widget panel based on user preference (default: hidden)
  await handleWidgetPanel()

  // Add fullscreen toggle button
  await buttons.injectFullscreenButton()
}

/**
 * Initialize dashboard page with UI customizations
 * @returns {boolean} True if initialization was successful
 */
function initializeDashboardPage() {
  // This function now defers to the centralized dashboard module
  const dashboard = require('./dashboard.js')

  // Delegate to the dashboard module for initialization
  // But return true immediately as dashboard module will handle retries
  try {
    dashboard.initializeDashboard()
    return true
  } catch (error) {
    utils.logError('Error delegating to dashboard module:', error)
    return false
  }
}

/**
 * Adjust the widget panel button appearance
 * @param {Object} options - Configuration options (not used anymore)
 * @returns {Promise<boolean>} True if operation was successful
 */
async function handleWidgetPanel(options = {}) {
  try {
    // Wait for widget panel elements to be ready
    await utils.waitUntil(() => {
      return (
        document.querySelector('[class^=dashboard__Widgets]') !== null &&
        document.querySelector('button[class^=dashboard__ExpandButton]') !== null
      )
    }, 5000)

    // Get the expand button
    const expandButton = document.querySelector('button[class^=dashboard__ExpandButton]')

    // Make the widget panel open/close button less prominent
    utils.setStyle(expandButton, 'opacity', '0.5')

    // No longer managing widget panel state - UniFi Protect handles this natively

    return true
  } catch (error) {
    utils.logError('Error handling widget panel:', error)
    return false
  }
}

/**
 * Apply the user's navigation visibility preferences across all pages
 * @returns {Promise<boolean>} True if successfully applied navigation preferences
 */
async function applyUserNavigationPreferences() {
  try {
    // Get config and check user's navigation visibility preference
    const config = (await ipcRenderer.invoke('configLoad')) || {}

    // Always use individual settings and provide defaults
    // IMPORTANT: Default is to SHOW nav and header (false for hideNav/hideHeader)
    // This ensures elements aren't hidden unless explicitly set to true in config
    const hideNav = config.hideNav === true
    const hideHeader = config.hideHeader === true

    // Check if we're on a protect page
    const isProtectPage = window.location.href.includes('/protect/')
    const isDashboardPage = window.location.href.includes('/protect/dashboard')

    // utils.logger.debug(`Applying navigation preferences: hideNav=${hideNav}, hideHeader=${hideHeader}`)

    // Wait for navigation elements to be fully loaded
    try {
      await utils.waitUntil(
        () => document.querySelector('header') !== null && document.querySelector('nav') !== null,
        5000,
      )
    } catch (error) {
      utils.logError('Navigation elements not found within timeout', error)
      return false
    }

    const header = document.querySelector('header')
    const nav = document.querySelector('nav')

    if (header && nav) {
      // Get current element states before applying changes
      const navStyle = window.getComputedStyle(nav)
      const headerStyle = window.getComputedStyle(header)
      const currentNavHidden = navStyle.display === 'none'
      const currentHeaderHidden = headerStyle.display === 'none'

      // Only apply changes if needed
      if (currentNavHidden !== hideNav) {
        utils.setStyle(nav, 'display', hideNav ? 'none' : 'flex')
      }

      if (currentHeaderHidden !== hideHeader) {
        utils.setStyle(header, 'display', hideHeader ? 'none' : 'flex')
      }

      // Add a small delay before handling dashboard button
      // This ensures styles are applied and properly computed
      await utils.wait(50)

      // Handle dashboard button visibility immediately
      buttons.handleDashboardButton().catch((error) => {
        utils.logError('Error handling dashboard button visibility', error)
      })

      return true
    }

    return false
  } catch (error) {
    utils.logError('Error applying navigation preferences', error)
    return false
  }
}

/**
 * Initialize UI elements that should appear on all pages
 * This ensures common UI elements are available regardless of page type
 * @returns {Promise<boolean>} True if initialization was successful
 */
async function initializeCommonUI() {
  try {
    // Create a flag to track the first load
    window._isInitialLoad = true

    // Only apply navigation preferences on Protect pages
    const isProtectPage = window.location.href.includes('/protect/')
    if (isProtectPage) {
      // Inject our custom button styles
      buttonStyles.injectButtonStyles()

      // Apply user's navigation visibility preferences
      // This is crucial for restoring the correct visibility on page load
      await applyUserNavigationPreferences()
    } else {
      // utils.logger.debug('Not a Protect page, skipping navigation preferences')
    }

    // Reset the initial load flag after applying preferences
    setTimeout(() => {
      window._isInitialLoad = false
    }, 1000)

    // Inject buttons (will only inject if not already present)
    // Note: Button styling is handled by CSS classes defined in buttonStyles module
    await buttons.injectFullscreenButton()
    await buttons.injectSidebarButton()

    // Set up a MutationObserver to watch for changes to nav visibility
    setupNavigationObserver()

    // Also set up URL change listener to reapply preferences when navigating to Protect pages
    setupUrlChangeListener()

    return true
  } catch (error) {
    utils.logError('Error initializing common UI elements', error)
    return false
  }
}

/**
 * Sets up a MutationObserver to watch for changes to the navigation elements
 * and re-evaluate dashboard button visibility when they change
 */
function setupNavigationObserver() {
  let navObserver = null
  let navStyleEnforcer = null

  // First, wait for the body to be ready
  if (document.body) {
    startObserver()
  } else {
    document.addEventListener('DOMContentLoaded', startObserver)
  }

  function startObserver() {
    // If nav exists, observe it directly
    const nav = document.querySelector('nav')
    if (nav) {
      observeNav(nav)
    } else {
      // Otherwise, observe the body for nav to be added
      const bodyObserver = new MutationObserver((mutations) => {
        const nav = document.querySelector('nav')
        if (nav) {
          observeNav(nav)
          bodyObserver.disconnect()
        }
      })

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      })
    }
  }

  function observeNav(nav) {
    if (navObserver) {
      navObserver.disconnect()
    }

    navObserver = new MutationObserver((mutations) => {
      // Only re-evaluate if not in the middle of a toggle operation
      if (!window._navToggleInProgress) {
        // Check if any of the mutations are style changes to nav or header
        const styleChanged = mutations.some(
          (mutation) =>
            mutation.type === 'attributes' &&
            mutation.attributeName === 'style' &&
            (mutation.target.tagName.toLowerCase() === 'nav' || mutation.target.tagName.toLowerCase() === 'header'),
        )

        if (styleChanged) {
          // Re-apply our settings to override app changes
          enforceNavSettings()
        }

        // Re-evaluate dashboard button visibility when nav changes
        handleDashboardButton().catch((error) => {
          utils.logError('Error handling dashboard button visibility from observer', error)
        })
      }
    })

    // Watch for attribute changes (like style/display) and child changes
    navObserver.observe(nav, {
      attributes: true,
      childList: true,
      attributeFilter: ['style', 'class'],
    })

    // Also observe the header for changes
    const header = document.querySelector('header')
    if (header) {
      navObserver.observe(header, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      })
    }

    // Also observe the parent of nav for changes that might affect nav's visibility
    if (nav.parentElement) {
      navObserver.observe(nav.parentElement, {
        attributes: true,
        childList: true,
        attributeFilter: ['style', 'class'],
      })
    }

    // Set up an interval to enforce nav settings
    setupNavEnforcer()

    // utils.logger.debug('Navigation observer set up successfully')
  }

  // Function to enforce navigation settings
  async function enforceNavSettings() {
    try {
      const config = (await ipcRenderer.invoke('configLoad')) || {}
      const hideNav = config.hideNav === true
      const hideHeader = config.hideHeader === true

      const nav = document.querySelector('nav')
      const header = document.querySelector('header')

      if (nav && header) {
        const navStyle = window.getComputedStyle(nav)
        const headerStyle = window.getComputedStyle(header)
        const navCurrentlyHidden = navStyle.display === 'none'
        const headerCurrentlyHidden = headerStyle.display === 'none'

        // Only apply if there's a mismatch
        if (navCurrentlyHidden !== hideNav) {
          utils.setStyle(nav, 'display', hideNav ? 'none' : 'flex')
        }

        if (headerCurrentlyHidden !== hideHeader) {
          utils.setStyle(header, 'display', hideHeader ? 'none' : 'flex')
        }
      }
    } catch (error) {
      utils.logError('Error enforcing navigation settings', error)
    }
  }

  // Setup a periodic enforcer to ensure settings are maintained
  function setupNavEnforcer() {
    if (navStyleEnforcer) {
      clearInterval(navStyleEnforcer)
    }

    // Only enforce for the first few seconds after page load when app is most likely to override
    let enforcementCount = 0
    const maxEnforcements = 10 // Enforce 10 times

    navStyleEnforcer = setInterval(() => {
      if (enforcementCount < maxEnforcements) {
        enforceNavSettings()
        enforcementCount++
      } else {
        // After max enforcements, clear the interval
        clearInterval(navStyleEnforcer)
        navStyleEnforcer = null
      }
    }, 300) // Check every 300ms
  }

  // Return a cleanup function that can be called to remove the observer
  return () => {
    if (navObserver) {
      navObserver.disconnect()
      navObserver = null
    }
    if (navStyleEnforcer) {
      clearInterval(navStyleEnforcer)
      navStyleEnforcer = null
    }
  }
}

/**
 * Sets up a listener for URL changes to reapply navigation preferences when needed
 */
function setupUrlChangeListener() {
  // Don't set up duplicate listeners
  if (window._urlChangeListenerActive) return

  // Use a MutationObserver to watch for URL changes
  // This is needed because the app uses client-side routing
  let lastUrl = window.location.href
  let urlCheckInterval = null

  // For SPAs, the best approach is a combination of methods
  // 1. Check URL periodically
  // 2. Watch for DOM changes that might indicate navigation

  // Periodic URL check (most reliable for SPAs)
  urlCheckInterval = setInterval(() => {
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
      handleUrlChange(lastUrl, currentUrl)
      lastUrl = currentUrl
    }
  }, 500)

  // Also use MutationObserver as backup
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
      handleUrlChange(lastUrl, currentUrl)
      lastUrl = currentUrl
    }
  })

  // Start observing document changes
  observer.observe(document, { subtree: true, childList: true })

  // Set up history API interceptors for better SPA detection
  setupHistoryApiInterceptors()

  // Mark as active
  window._urlChangeListenerActive = true

  // Function to handle URL changes
  function handleUrlChange(oldUrl, newUrl) {
    const wasProtectPage = oldUrl.includes('/protect/')
    const isProtectPage = newUrl.includes('/protect/')

    // utils.logger.debug(`URL changed from ${oldUrl} to ${newUrl}`)

    // If we navigated to or within Protect pages, apply preferences
    if (isProtectPage) {
      // Short delay to ensure DOM is ready after SPA navigation
      setTimeout(() => {
        applyUserNavigationPreferences().catch((error) => {
          // utils.logError('Error applying navigation preferences after URL change', error)
        })

        // Set up continuous enforcement for the first few seconds
        // This helps override any app behavior that restores nav/header
        let enforcementCount = 0
        const enforcementInterval = setInterval(() => {
          if (enforcementCount < 10) {
            // Enforce 10 times
            const nav = document.querySelector('nav')
            const header = document.querySelector('header')

            if (nav && header) {
              ipcRenderer
                .invoke('configLoad')
                .then((config) => {
                  const hideNav = config.hideNav === true
                  const hideHeader = config.hideHeader === true

                  const navStyle = window.getComputedStyle(nav)
                  const headerStyle = window.getComputedStyle(header)
                  const navCurrentlyHidden = navStyle.display === 'none'
                  const headerCurrentlyHidden = headerStyle.display === 'none'

                  if (navCurrentlyHidden !== hideNav) {
                    utils.setStyle(nav, 'display', hideNav ? 'none' : 'flex')
                  }

                  if (headerCurrentlyHidden !== hideHeader) {
                    utils.setStyle(header, 'display', hideHeader ? 'none' : 'flex')
                  }
                })
                .catch((error) => {
                  utils.logError('Error in URL change enforcer', error)
                })
            }
            enforcementCount++
          } else {
            clearInterval(enforcementInterval)
          }
        }, 500) // Check every 500ms
      }, 100)
    }
  }

  // Setup History API interceptors to better detect SPA navigation
  function setupHistoryApiInterceptors() {
    // Only set up once
    if (window._historyInterceptorsActive) return

    // Store original functions
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    // Override pushState
    window.history.pushState = function () {
      const result = originalPushState.apply(this, arguments)
      // Dispatch event for URL change listeners
      const newUrl = window.location.href
      if (newUrl !== lastUrl) {
        handleUrlChange(lastUrl, newUrl)
        lastUrl = newUrl
      }
      return result
    }

    // Override replaceState
    window.history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments)
      // Dispatch event for URL change listeners
      const newUrl = window.location.href
      if (newUrl !== lastUrl) {
        handleUrlChange(lastUrl, newUrl)
        lastUrl = newUrl
      }
      return result
    }

    // Mark as active
    window._historyInterceptorsActive = true
  }

  // Return a cleanup function that can be called to remove the observer
  return () => {
    if (observer) {
      observer.disconnect()
    }
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval)
    }
    window._urlChangeListenerActive = false
  }
}

// Export the functions
module.exports = {
  handleLiveView,
  initializeDashboardPage,
  handleWidgetPanel,
  initializeCommonUI,
  applyUserNavigationPreferences,
  setupNavigationObserver,
  setupUrlChangeListener,
}
