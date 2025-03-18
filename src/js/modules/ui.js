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

  // Apply navigation visibility based on user preference
  utils.setStyle(document.getElementsByTagName('header')[0], 'display', hideNavigation ? 'none' : 'flex')
  utils.setStyle(document.getElementsByTagName('nav')[0], 'display', hideNavigation ? 'none' : 'flex')

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
  showNavPopup.innerHTML = '<kbd>Esc</kbd> Show/Hide Navigation'
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
      align-items: center;
      position: fixed;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 18px;
      color: hsl(210, 10%, 80%);
      background-color: rgba(0, 0, 0, 0.6);
      pointer-events: none;
      animation: fadeOut 4s ease-in forwards;
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
  }, 4000)
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

  // Check if the nav is visible. If not, show the dashboard button
  const nav = document.getElementsByTagName('nav')[0]
  if (!nav || nav.style.display === 'none') {
    setDashboardButtonVisibility(true)
    return
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
 */
function toggleNavigation() {
  const header = document.querySelector('header')
  const nav = document.querySelector('nav')

  if (header && nav) {
    const isHidden = header.style.display === 'none'
    header.style.display = isHidden ? 'flex' : 'none'
    nav.style.display = isHidden ? 'flex' : 'none'

    // Save only the navigation visibility preference
    try {
      // Send only the hideNavigation property, not the entire config
      ipcRenderer.send('configSave', { hideNavigation: !isHidden })
    } catch (e) {
      console.error('Error saving navigation preference:', e)
    }
  }

  // Add call to handle dashboard button visibility when toggling navigation
  handleDashboardButton()
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

  // Escape to toggle Navigation (nav & header elements)
  if (event.key === 'Escape') {
    // Prevent page reload
    event.preventDefault()
    toggleNavigation()
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
