const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')

// Import utility functions that UI customization depends on
const utils = require('./utils')

/**
 * Fullscreen view modification function to customize the LiveView UI
 */
async function handleLiveviewV5() {
  // wait until liveview is present
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

  // Get config and check user's navigation visibility preference
  const config = (await ipcRenderer.invoke('configLoad')) || {}
  // Default to hiding navigation if setting doesn't exist
  const hideNavigation = config.hideNavigation !== false

  // Load individual element settings if available
  const hideNav = config.hideNav !== false
  const hideHeader = config.hideHeader !== false

  // Wait for navigation elements to be fully loaded
  try {
    await utils.waitUntil(
      () => document.getElementsByTagName('header').length > 0 && document.getElementsByTagName('nav').length > 0,
      5000,
    )
  } catch (error) {
    utils.logError('Navigation elements not found within timeout', error)
  }

  // Apply navigation visibility with retry mechanism
  const applyNavigationVisibility = async () => {
    const header = document.getElementsByTagName('header')[0]
    const nav = document.getElementsByTagName('nav')[0]

    if (header && nav) {
      // Check if we have individual settings in the config
      if (config.hideNav !== undefined || config.hideHeader !== undefined) {
        // Apply individual element settings
        utils.setStyle(nav, 'display', hideNav ? 'none' : 'flex')
        utils.setStyle(header, 'display', hideHeader ? 'none' : 'flex')
      } else {
        // Apply legacy setting to both elements
        utils.setStyle(header, 'display', hideNavigation ? 'none' : 'flex')
        utils.setStyle(nav, 'display', hideNavigation ? 'none' : 'flex')
      }
      return true
    }
    return false
  }

  // Try applying navigation visibility, retry if necessary
  if (!(await applyNavigationVisibility())) {
    // Wait a bit and try again
    await utils.wait(500)
    await applyNavigationVisibility()
  }

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

  // Check if the widget panel is open
  let isWidgetPanelOpen = document.querySelector('[class^=dashboard__Widgets]').offsetWidth > 0

  // If the widget panel is open, close it
  if (isWidgetPanelOpen) {
    document.querySelectorAll('button[class^=dashboard__ExpandButton]')[0].click()
  }

  // Make the widget panel open/close button less prominent
  utils.setStyle(document.querySelectorAll('button[class^=dashboard__ExpandButton]')[0], 'opacity', '0.5')

  // Show dashboard button after UI modifications
  handleDashboardButton()
}

/**
 * Helper for dashboard button navigation
 */
function triggerDashboardNavigation() {
  // Get the URL up to the '/protect/' part
  const protectIndex = document.URL.indexOf('/protect/')
  const baseUrl = document.URL.substring(0, protectIndex + '/protect/'.length)
  const dashboardUrl = baseUrl + 'dashboard'

  // Find the UniFi dashboard link
  const dashboardLink = document.querySelector('a[href*="/protect/dashboard"]')

  // If the link is present, click it. Otherwise, navigate directly.
  if (dashboardLink) dashboardLink.click()
  else window.location.href = dashboardUrl
}

/**
 * Dashboard button overlay function
 */
function injectDashboardButton() {
  if (document.getElementById('dashboard-button')) return

  const button = document.createElement('button')
  button.id = 'dashboard-button'

  // Read the SVG file
  const svgPath = path.join(__dirname, '../../img/dashboard-icon.svg')
  let dashboardSvg

  try {
    dashboardSvg = fs.readFileSync(svgPath, 'utf8')
  } catch (error) {
    console.error('Error reading dashboard SVG:', error)
    // Fallback to a simple text button if SVG can't be loaded
    dashboardSvg = '<div>Dashboard</div>'
  }

  const buttonContent = `
  <div style="display: flex;align-items: center;">
    <div style="margin-right:4px; font-size:18px;">←</div>
    ${dashboardSvg}
  </div>`

  button.innerHTML = buttonContent
  button.onclick = triggerDashboardNavigation

  document.body.appendChild(button)

  // Create an informational popup to tell people how to show the nav
  const showNavPopup = document.createElement('div')
  showNavPopup.id = 'show-nav-popup'
  showNavPopup.innerHTML = `<div><kbd>Esc</kbd> Toggle Navigation</div>`

  // TODO: We could show these if we think they are valuable, but it's too noisy, IMO.
  //<div><kbd>Alt</kbd>+<kbd>N</kbd> Toggle Side Nav</div>
  //<div><kbd>Alt</kbd>+<kbd>H</kbd> Toggle Header</div>
  document.body.appendChild(showNavPopup)

  // Create and inject the stylesheet
  const style = document.createElement('style')
  style.innerHTML = `
    #dashboard-button {
      position: fixed;
      top: 48px;
      left: 24px;
      z-index: 1000;
      padding: 2px 8px;
      border: none;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
      line-height: 1.6;
      color: rgb(183, 188, 194);
      background-color: rgba(0, 0, 0, 0.6);
    }

    #dashboard-button:hover {
      background-color: rgba(0, 0, 0, 0.7);
      color: rgb(153, 160, 168);
    }

    #show-nav-popup {
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: fixed;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      padding: 14px 16px;
      border-radius: 4px;
      font-size: 16px;
      color: hsl(210, 10%, 80%);
      background-color: rgba(0, 0, 0, 0.6);
      pointer-events: none;
      animation: fadeOut 5s ease-in forwards;
    }

    @keyframes fadeOut {
      0% { opacity: 1; }
      65% { opacity: 1; }
      100% { opacity: 0; }
    }

    #show-nav-popup kbd {
      color: white;
      display: inline-block;
      margin-right: 2px;
      font-weight: semibold;
      border-radius: 4px;
      border: 1px solid rgb(183, 188, 194);
      padding: 1px 2px;
    }
  `

  document.body.appendChild(style)

  // Remove the popup from DOM after animation
  setTimeout(() => {
    const popup = document.getElementById('show-nav-popup')
    if (popup) {
      popup.remove()
    }
  }, 5000) // Increased timeout to allow reading all shortcuts
}

/**
 * Function to handle dashboard button visibility
 */
function handleDashboardButton() {
  injectDashboardButton()

  // Check if we're already on dashboard
  if (document.URL.includes('/protect/dashboard')) {
    setDashboardButtonVisibility(false)
    return
  }

  // More robustly check if both nav and header are visible
  const nav = document.querySelector('nav')
  const header = document.querySelector('header')

  // Show dashboard button if either nav or header doesn't exist or is hidden
  const navHidden = !nav || nav.style.display === 'none'
  const headerHidden = !header || header.style.display === 'none'

  // If either element is hidden, show the dashboard button
  if (navHidden || headerHidden) {
    setDashboardButtonVisibility(true)
  } else {
    setDashboardButtonVisibility(false)
  }
}

/**
 * Set the visibility of the dashboard button
 */
function setDashboardButtonVisibility(show) {
  const button = document.getElementById('dashboard-button')
  if (!button) return

  if (show) button.style.display = 'block'
  else button.style.display = 'none'
}

/**
 * Toggle navigation UI elements
 * @param {Object} options - Configuration options
 * @param {boolean} [options.toggleNav=true] - Whether to toggle the nav element
 * @param {boolean} [options.toggleHeader=true] - Whether to toggle the header element
 * @returns {Promise<boolean>} True if toggle was successful
 */
async function toggleNavigation(options = {}) {
  // Default to toggling both elements if no options provided
  const toggleNav = options.toggleNav !== undefined ? options.toggleNav : true
  const toggleHeader = options.toggleHeader !== undefined ? options.toggleHeader : true

  // Wait for navigation elements to be ready
  try {
    await utils.waitUntil(
      () => document.querySelector('header') !== null && document.querySelector('nav') !== null,
      3000,
    )
  } catch (error) {
    utils.logError('Navigation elements not found for toggle', error)
    return false
  }

  const header = document.querySelector('header')
  const nav = document.querySelector('nav')

  if (header && nav) {
    // Determine current state
    const isHeaderHidden = header.style.display === 'none'
    const isNavHidden = nav.style.display === 'none'

    // If both elements are requested to be toggled
    if (toggleNav && toggleHeader) {
      // If any element is hidden, show both; otherwise hide both
      const anyHidden = isHeaderHidden || isNavHidden
      header.style.display = anyHidden ? 'flex' : 'none'
      nav.style.display = anyHidden ? 'flex' : 'none'

      // Save both the legacy and new config properties
      try {
        ipcRenderer.send('configSave', {
          hideNavigation: !anyHidden,
          hideNav: !anyHidden,
          hideHeader: !anyHidden,
        })
      } catch (e) {
        console.error('Error saving navigation preferences:', e)
      }
    } else {
      // Toggle individual elements as requested
      if (toggleHeader) {
        header.style.display = isHeaderHidden ? 'flex' : 'none'
      }

      if (toggleNav) {
        nav.style.display = isNavHidden ? 'flex' : 'none'
      }

      // Save the individual settings
      const newHeaderHidden = toggleHeader ? !isHeaderHidden : isHeaderHidden
      const newNavHidden = toggleNav ? !isNavHidden : isNavHidden

      try {
        const configUpdate = {}

        // Only update the properties that were actually toggled
        if (toggleNav) {
          configUpdate.hideNav = newNavHidden
        }

        if (toggleHeader) {
          configUpdate.hideHeader = newHeaderHidden
        }

        // Also update the legacy property if both elements are in the same state
        if (newHeaderHidden === newNavHidden && toggleNav && toggleHeader) {
          configUpdate.hideNavigation = newHeaderHidden
        }

        ipcRenderer.send('configSave', configUpdate)
      } catch (e) {
        console.error('Error saving navigation preferences:', e)
      }
    }
  }

  // Add call to handle dashboard button visibility when toggling navigation
  handleDashboardButton()

  return true
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
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardShortcuts(event) {
  // F10 for reset
  if (event.key === 'F10') {
    if (event.shiftKey) {
      // Force reset with Shift+F10
      ipcRenderer.send('reset')
      ipcRenderer.send('restart')
    } else {
      // Show confirmation dialog
      ipcRenderer.invoke('showResetConfirmation').then((confirmed) => {
        if (confirmed) {
          ipcRenderer.send('reset')
          ipcRenderer.send('restart')
        }
      })
    }
  }

  // F9 for restart
  if (event.key === 'F9') {
    ipcRenderer.send('restart')
  }

  // Fullscreen toggle shortcuts
  if (
    // F11 for all platforms
    event.key === 'F11' ||
    // macOS native Ctrl+Cmd+F
    (process.platform === 'darwin' && event.key.toLowerCase() === 'f' && event.ctrlKey && event.metaKey)
  ) {
    event.preventDefault() // Prevent default browser behavior
    // Request fullscreen via IPC
    ipcRenderer.send('toggleFullscreen')
  }

  // Escape to toggle Navigation (nav & header elements)
  if (event.key === 'Escape') {
    // Prevent page reload
    event.preventDefault()
    toggleNavigation().catch((error) => {
      utils.logError('Error toggling navigation:', error)
    })
  }

  // Add Alt+N to toggle just the nav
  if (event.key.toLowerCase() === 'n' && event.altKey) {
    event.preventDefault()
    toggleNavigation({ toggleNav: true, toggleHeader: false }).catch((error) => {
      utils.logError('Error toggling nav:', error)
    })
  }

  // Add Alt+H to toggle just the header
  if (event.key.toLowerCase() === 'h' && event.altKey) {
    event.preventDefault()
    toggleNavigation({ toggleNav: false, toggleHeader: true }).catch((error) => {
      utils.logError('Error toggling header:', error)
    })
  }
}

/**
 * Set up keyboard shortcut handling
 */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', handleKeyboardShortcuts)

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyboardShortcuts)
  }
}

// Export the functions
module.exports = {
  handleLiveviewV5,
  triggerDashboardNavigation,
  injectDashboardButton,
  handleDashboardButton,
  setDashboardButtonVisibility,
  toggleNavigation,
  initializeDashboardPage,
  setupKeyboardShortcuts,
}
