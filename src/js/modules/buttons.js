const { ipcRenderer } = require('electron')
const utils = require('./utils')
const fs = require('fs')
const path = require('path')
// Import the toggleFullscreen and togglePageElements from ui.js to avoid circular dependencies
// These functions will be exposed via buttons.js and referenced by ui.js
// Importing ui module for handleDashboardButton function - be careful of circular imports
// Import the buttonStyles module directly to use it for checks and injection
const buttonStyles = require('./buttonStyles')
let ui

// To avoid circular dependency issues, we'll load ui lazily when needed
function getUi() {
  if (!ui) {
    ui = require('./ui')
  }
  return ui
}

/**
 * Generalizes button creation for header UI buttons
 * @param {Object} options - Button creation options
 * @param {string} options.id - Button ID
 * @param {string} options.label - Button label text
 * @param {Function} options.onClick - Click handler function
 * @param {Function} options.updateContent - Function to update button content (gets called after creation)
 * @param {Object} options.icons - Icon SVGs object
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function createHeaderButton(options) {
  const { id, label, onClick, updateContent, icons = {} } = options

  // Check if button styles are present, inject them if not
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    // Inject button styles before proceeding
    buttonStyles.injectButtonStyles()
    utils.logger.debug('Button styles were missing, injected them before creating button')
  }

  // Strict check to prevent duplicate injections
  if (document.getElementById(id)) {
    return true
  }

  // Create the button element
  const button = document.createElement('button')
  button.id = id
  button.className = 'header-button'

  // Set initial content
  button.innerHTML = `
    <div id="${id}-label" class="header-button-label">
      ${label}
    </div>
    <div class="header-button-icon">
      <div id="${id}-icon"></div>
    </div>
  `

  // Set click handler
  button.onclick = onClick

  try {
    // Wait for header to be available
    await utils.waitUntil(() => document.querySelector('header') !== null, 5000)

    // Double check button wasn't created during waiting (race condition)
    if (document.getElementById(id)) {
      return true
    }

    // Find the appropriate place to insert the button
    const header = document.querySelector('header')
    if (!header) {
      throw new Error('Header element not found')
    }

    const headerChildren = Array.from(header.children).filter((child) => !child.classList.contains('global-loader'))
    const targetElement = headerChildren.length > 1 ? headerChildren[headerChildren.length - 1] : null

    // Insert button at the appropriate location
    if (targetElement) {
      targetElement.prepend(button)
    } else {
      header.appendChild(button)
    }

    // Update button content immediately after adding to DOM
    if (typeof updateContent === 'function') {
      updateContent(button, icons)
    }

    return true
  } catch (error) {
    utils.logError(`Error injecting ${id} button`, error)
    return false
  }
}

/**
 * Inject a fullscreen toggle button into the header
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function injectFullscreenButton() {
  // Ensure button styles are present
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
    utils.logger.debug('Button styles were missing, injected them before creating fullscreen button')
  }

  // SVG icons for fullscreen states
  const icons = {
    enter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M344 0L488 0c13.3 0 24 10.7 24 24l0 144c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39-87 87c-9.4 9.4-24.6 9.4-33.9 0l-32-32c-9.4-9.4-9.4-24.6 0-33.9l87-87L327 41c-6.9-6.9-8.9-17.2-5.2-26.2S334.3 0 344 0zM168 512L24 512c-13.3 0-24-10.7-24-24L0 344c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39 87-87c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8z"/></svg>`,
    exit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M439 7c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8l-144 0c-13.3 0-24-10.7-24-24l0-144c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39L439 7zM72 272l144 0c13.3 0 24 10.7 24 24l0 144c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39L73 505c-9.4 9.4-24.6 9.4-33.9 0L7 473c-9.4-9.4-9.4-24.6 0-33.9l87-87L55 313c-6.9-6.9-8.9-17.2-5.2-26.2s12.5-14.8 22.2-14.8z"/></svg>`,
  }

  // Function to update button content based on fullscreen state
  const updateFullscreenButtonContent = (button) => {
    // Query the fullscreen state from Electron
    ipcRenderer
      .invoke('isFullScreen')
      .then((isFullscreen) => {
        button.innerHTML = `
          <div id="fullscreen-button-label" class="header-button-label">
            ${isFullscreen ? 'Exit&nbsp;' : ''}Fullscreen
          </div>
          <div class="header-button-icon" title="Toggle Fullscreen (F11)">
            <div id="fullscreen-icon">
              ${isFullscreen ? icons.exit : icons.enter}
            </div>
          </div>
        `
      })
      .catch((error) => {
        // Fallback if IPC fails
        utils.logError('Error getting fullscreen state:', error)
        // Assume not fullscreen if error
        button.innerHTML = `
          <div id="fullscreen-button-label" class="header-button-label">
            Fullscreen
          </div>
          <div class="header-button-icon" title="Toggle Fullscreen (F11)">
            <div id="fullscreen-icon">
              ${icons.enter}
            </div>
          </div>
        `
      })
  }

  // Listen for fullscreen state changes from Electron
  ipcRenderer.on('fullscreen-change', (event, isFullscreen) => {
    const button = document.getElementById('fullscreen-button')
    if (button) {
      updateFullscreenButtonContent(button)
    }
  })

  // Use the generalized function to create the button
  return createHeaderButton({
    id: 'fullscreen-button',
    label: 'Fullscreen',
    onClick: toggleFullscreen,
    updateContent: updateFullscreenButtonContent,
    icons: icons,
  })
}

/**
 * Inject a sidebar toggle button into the header
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function injectSidebarButton() {
  // Ensure button styles are present
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
    utils.logger.debug('Button styles were missing, injected them before creating sidebar button')
  }

  // Simple rectangle SVG icons for sidebar states
  const icons = {
    hidden: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="CurrentColor" d="M44 31v2L32 45a2 2 0 0 1-2-3l10-10-10-10a2 2 0 0 1 2-3l12 12Z"/></svg>`,
    visible: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="currentColor" d="M30 33v-2l11-12a2 2 0 0 1 3 3L34 32l10 10a2 2 0 0 1-3 3L30 33Z"/></svg>`,
  }

  // Function to update button content based on sidebar state
  const updateSidebarButtonContent = async (button) => {
    try {
      // Get config to check current nav state
      const config = (await ipcRenderer.invoke('configLoad')) || {}
      const isNavHidden = config.hideNav === true

      button.innerHTML = `
        <div id="sidebar-button-label" class="header-button-label">
          ${isNavHidden ? 'Show' : 'Hide'} Nav
        </div>
        <div class="header-button-icon" title="Toggle Sidebar">
          <div id="sidebar-icon">
            ${isNavHidden ? icons.hidden : icons.visible}
          </div>
        </div>
      `
    } catch (error) {
      utils.logError('Error getting sidebar state:', error)
      // Default fallback
      button.innerHTML = `
        <div id="sidebar-button-label" class="header-button-label">
          Toggle Sidebar
        </div>
        <div class="header-button-icon" title="Toggle Sidebar">
          <div id="sidebar-icon">
            ${icons.visible}
          </div>
        </div>
      `
    }
  }

  // Function to toggle only the sidebar
  const toggleSidebar = () => {
    // Call the local togglePageElements function
    togglePageElements({ toggleNav: true, toggleHeader: false })
  }

  // Use the generalized function to create the button
  return createHeaderButton({
    id: 'sidebar-button',
    label: 'Toggle Sidebar',
    onClick: toggleSidebar,
    updateContent: updateSidebarButtonContent,
    icons: icons,
  })
}

/**
 * Toggles fullscreen mode for the document
 */
function toggleFullscreen() {
  // Use the IPC renderer to trigger fullscreen through Electron's API
  // This matches how keyboard shortcuts handle fullscreen
  ipcRenderer.send('toggleFullscreen')
}

/**
 * Toggle visibility of the navigation and/or header elements
 * @param {Object} options - Options for toggling
 * @param {boolean} [options.toggleNav=true] - Whether to toggle the nav sidebar
 * @param {boolean} [options.toggleHeader=true] - Whether to toggle the header
 * @returns {Promise<void>} Promise resolving when toggle is complete
 */
async function togglePageElements(options = {}) {
  try {
    // Set a global flag to indicate navigation toggle is in progress
    window._navToggleInProgress = true

    // Get the current configuration
    const config = (await ipcRenderer.invoke('configLoad')) || {}

    // Get navigation elements
    const nav = document.querySelector('nav')
    const header = document.querySelector('header')

    if (!nav || !header) {
      utils.logger.warn('Navigation elements not found')
      window._navToggleInProgress = false
      return
    }

    // Default behavior: toggle both elements unless specific toggle options are provided
    const toggleNav = options.toggleNav !== undefined ? options.toggleNav : true
    const toggleHeader = options.toggleHeader !== undefined ? options.toggleHeader : true

    // Check if this is the ESC key toggling both (default behavior)
    const isToggleAll = toggleNav && toggleHeader

    // Get current visibility states
    const navStyle = window.getComputedStyle(nav)
    const headerStyle = window.getComputedStyle(header)
    const isNavHidden = navStyle.display === 'none'
    const isHeaderHidden = headerStyle.display === 'none'

    // Create an object to hold just the navigation settings to save
    const navSettings = {}

    // For ESC key shortcut (toggle all) behavior
    if (isToggleAll) {
      // If everything is hidden, show both, otherwise hide both
      const allHidden = isNavHidden && isHeaderHidden
      const newState = !allHidden

      // Update config and settings to save
      navSettings.hideNav = newState
      navSettings.hideHeader = newState

      // Update the elements style
      utils.setStyle(nav, 'display', newState ? 'none' : 'flex')
      utils.setStyle(header, 'display', newState ? 'none' : 'flex')

      // utils.logger.debug(`Toggling ALL navigation elements: ${newState ? 'hiding' : 'showing'}`)
    } else {
      // Handle individual element toggles

      // For nav toggle (Alt+N)
      if (toggleNav) {
        const newNavState = !isNavHidden
        navSettings.hideNav = newNavState
        utils.setStyle(nav, 'display', newNavState ? 'none' : 'flex')
        // utils.logger.debug(`Toggling nav sidebar: ${newNavState ? 'hiding' : 'showing'}`)

        // Update sidebar button state immediately after style change
        const sidebarButton = document.getElementById('sidebar-button')
        if (sidebarButton) {
          // Reuse the icons defined in injectSidebarButton (assuming they are accessible)
          // Need to define icons here or make them globally accessible. Defining here for now.
          const icons = {
            hidden: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="CurrentColor" d="M44 31v2L32 45a2 2 0 0 1-2-3l10-10-10-10a2 2 0 0 1 2-3l12 12Z"/></svg>`,
            visible: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="currentColor" d="M30 33v-2l11-12a2 2 0 0 1 3 3L34 32l10 10a2 2 0 0 1-3 3L30 33Z"/></svg>`,
          }
          try {
            sidebarButton.innerHTML = `
              <div id="sidebar-button-label" class="header-button-label">
                ${newNavState ? 'Show' : 'Hide'} Nav
              </div>
              <div class="header-button-icon" title="Toggle Sidebar">
                <div id="sidebar-icon">
                  ${newNavState ? icons.hidden : icons.visible}
                </div>
              </div>
            `
          } catch (error) {
            // Log error but don't break the main toggle functionality
            utils.logError('Error updating sidebar button content within togglePageElements:', error)
          }
        }
      }

      // For header toggle (Alt+H)
      if (toggleHeader) {
        const newHeaderState = !isHeaderHidden
        navSettings.hideHeader = newHeaderState
        utils.setStyle(header, 'display', newHeaderState ? 'none' : 'flex')
        // utils.logger.debug(`Toggling header: ${newHeaderState ? 'hiding' : 'showing'}`)
      }
    }

    // Save settings using configSavePartial
    // utils.logger.debug(
    //   `Saving navigation settings: hideNav=${navSettings.hideNav}, hideHeader=${navSettings.hideHeader}`,
    // )
    await ipcRenderer.invoke('configSavePartial', navSettings)

    // Update dashboard button visibility after toggling
    await handleDashboardButton()

    // Clear the toggle in progress flag after a short delay
    setTimeout(() => {
      window._navToggleInProgress = false
    }, 100)
  } catch (error) {
    utils.logError('Error toggling navigation', error)
    window._navToggleInProgress = false
  }
} // End of togglePageElements

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
 * Creates and injects the dashboard button into the DOM
 * Note: This only handles creation, not visibility - see handleDashboardButton for that logic
 */
function injectDashboardButton() {
  // Don't create duplicate buttons
  if (document.getElementById('dashboard-button')) return

  // Ensure button styles are present
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
    utils.logger.debug('Button styles were missing, injected them before creating dashboard button')
  }

  // Create button element
  const button = document.createElement('button')
  button.id = 'dashboard-button'
  button.className = 'dashboard-button'

  // Explicitly set to hidden initially
  // This ensures the button is always hidden until handleDashboardButton explicitly shows it
  button.style.display = 'none'

  // Load dashboard icon SVG
  const svgPath = path.join(__dirname, '../../img/dashboard-icon.svg')
  let dashboardSvg
  try {
    dashboardSvg = fs.readFileSync(svgPath, 'utf8')
  } catch (error) {
    console.error('Error reading dashboard SVG:', error)
    // Fallback to text if SVG can't be loaded
    dashboardSvg = '<div>Dashboard</div>'
  }

  // Set button content and click handler
  button.innerHTML = `
  <div style="display: flex;align-items: center;">
    <div style="margin-right:4px; font-size:18px;">←</div>
    ${dashboardSvg}
  </div>`
  button.onclick = triggerDashboardNavigation

  // Add button to DOM
  document.body.appendChild(button)

  // Create informational popup about keyboard shortcuts
  const showNavPopup = document.createElement('div')
  showNavPopup.id = 'show-nav-popup'
  showNavPopup.className = 'nav-popup'
  showNavPopup.innerHTML = `<div><kbd>Esc</kbd> Toggle Navigation</div>`
  document.body.appendChild(showNavPopup)

  // Remove popup after animation completes
  setTimeout(() => {
    const popup = document.getElementById('show-nav-popup')
    if (popup) popup.remove()
  }, 5000)

  return button
}

/**
 * Function to handle dashboard button visibility
 * @returns {Promise<void>} Promise that resolves when visibility is handled
 */
async function handleDashboardButton() {
  // Inject the button if it doesn't exist yet
  injectDashboardButton()

  // Check if we're already on dashboard page - never show button on dashboard
  if (document.URL.includes('/protect/dashboard')) {
    setDashboardButtonVisibility(false)
    return
  }

  // Wait for navigation elements to be ready with a longer timeout
  // This is important for initial page load and reloads
  try {
    await utils.waitUntil(
      () => document.querySelector('header') !== null && document.querySelector('nav') !== null,
      2000, // Increased timeout to 5 seconds
    )
  } catch (error) {
    // utils.logger.debug('Navigation elements not found within timeout, proceeding with visible dashboard button')
    setDashboardButtonVisibility(true)
    return
  }

  // To handle potential race conditions with styles being applied,
  // use a much shorter delay only on initial page load (not during toggle)
  if (!window._navToggleInProgress) {
    await utils.wait(50) // Reduced from 200ms to 50ms
  }

  // Check if nav sidebar is visible
  const nav = document.querySelector('nav')

  // Use getComputedStyle to check if the nav is actually visible
  // This works even if display style is not set inline
  let isNavVisible = false

  if (nav) {
    const navStyle = window.getComputedStyle(nav)
    isNavVisible = navStyle.display !== 'none' && navStyle.visibility !== 'hidden' && navStyle.opacity !== '0'

    // Additional check for dimensions - if width or height is 0, it's not really visible
    if (nav.offsetWidth === 0 || nav.offsetHeight === 0) {
      isNavVisible = false
    }
  }

  // More thorough check for dashboard link in the nav
  let hasDashboardLink = false
  if (isNavVisible && nav) {
    // Look for links that contain "dashboard" in their href or text content
    const navLinks = nav.querySelectorAll('a')
    for (const link of navLinks) {
      if (
        (link.href && link.href.includes('/protect/dashboard')) ||
        (link.textContent && link.textContent.toLowerCase().includes('dashboard'))
      ) {
        hasDashboardLink = true
        break
      }
    }
  }

  // Show our dashboard button in these cases:
  // - When we're not on dashboard page AND
  // - (Nav is not visible OR nav doesn't have a dashboard link)
  const shouldShowButton = !isNavVisible || !hasDashboardLink

  // Immediately set the button visibility
  setDashboardButtonVisibility(shouldShowButton)

  // Special handling for initial page load
  if (window._isInitialLoad) {
    // utils.logger.debug('Initial load detected, forcing dashboard button visibility re-evaluation')
    // Force dashboard button visibility check again after a slight delay
    // This helps ensure the correct visibility on initial page load
    setTimeout(() => {
      // Double-check visibility if this is initial load
      const nav = document.querySelector('nav')
      const isNavVisible = nav && window.getComputedStyle(nav).display !== 'none'
      const updatedShouldShow = !isNavVisible || !hasDashboardLink

      if (updatedShouldShow !== shouldShowButton) {
        setDashboardButtonVisibility(updatedShouldShow)
      }
    }, 300)
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

// Export the functions
module.exports = {
  createHeaderButton,
  injectFullscreenButton,
  injectSidebarButton,
  toggleFullscreen,
  togglePageElements,
  triggerDashboardNavigation,
  injectDashboardButton,
  handleDashboardButton,
  setDashboardButtonVisibility,
}
