const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')

// Import utility functions that UI customization depends on
const utils = require('./utils')

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
  await injectFullscreenButton()
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
 * Creates and injects the dashboard button into the DOM
 * Note: This only handles creation, not visibility - see handleDashboardButton for that logic
 */
function injectDashboardButton() {
  // Don't create duplicate buttons
  if (document.getElementById('dashboard-button')) return

  // Create button element
  const button = document.createElement('button')
  button.id = 'dashboard-button'

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
  showNavPopup.innerHTML = `<div><kbd>Esc</kbd> Toggle Navigation</div>`
  document.body.appendChild(showNavPopup)

  // Add CSS for dashboard button and popup
  addDashboardButtonStyles()

  // Remove popup after animation completes
  setTimeout(() => {
    const popup = document.getElementById('show-nav-popup')
    if (popup) popup.remove()
  }, 5000)

  return button
}

/**
 * Adds styles for dashboard button and navigation popup
 */
function addDashboardButtonStyles() {
  // Check if styles are already added
  if (document.getElementById('dashboard-button-style')) return

  const style = document.createElement('style')
  style.id = 'dashboard-button-style'
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

/**
 * Toggle visibility of the navigation elements
 * @param {Object} options - Options for toggling
 * @param {boolean} [options.toggleNav=true] - Whether to toggle the nav sidebar
 * @param {boolean} [options.toggleHeader=true] - Whether to toggle the header
 * @returns {Promise<void>} Promise resolving when toggle is complete
 */
async function toggleNavigation(options = {}) {
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
              <div id="sidebar-button-label" style="display: flex; align-items: center;">
                ${newNavState ? 'Show' : 'Hide'} Nav
              </div>
              <div style="border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Toggle Sidebar">
                <div id="sidebar-icon">
                  ${newNavState ? icons.hidden : icons.visible}
                </div>
              </div>
            `
          } catch (error) {
            // Log error but don't break the main toggle functionality
            utils.logError('Error updating sidebar button content within toggleNavigation:', error)
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
  // All shortcuts are now handled through the Electron menu system
  // This function remains as a placeholder in case we need to add
  // any keyboard shortcuts that can't be managed through the menu
  // (For example, shortcuts that need complex logic or dynamic behavior)
}

/**
 * Set up keyboard shortcut handling
 */
function setupKeyboardShortcuts() {
  // Since shortcuts are now handled by the menu system,
  // this function is kept for API compatibility
  // No need to add any listeners here

  // Return cleanup function (also for API compatibility)
  return () => {}
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
 * Generalizes button creation for header UI buttons
 * @param {Object} options - Button creation options
 * @param {string} options.id - Button ID
 * @param {string} options.label - Button label text
 * @param {Function} options.onClick - Click handler function
 * @param {Function} options.updateContent - Function to update button content (gets called after creation)
 * @param {string} options.styleId - Style element ID
 * @param {string} options.styles - CSS styles as string
 * @param {Object} options.icons - Icon SVGs object
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function createHeaderButton(options) {
  const { id, label, onClick, updateContent, styleId, styles, icons = {} } = options

  // Strict check to prevent duplicate injections
  if (document.getElementById(id)) {
    return true
  }

  // Add CSS styles if not already present
  if (styleId && styles && !document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.innerHTML = styles

    // Insert style at the beginning of head
    if (document.head.firstChild) {
      document.head.insertBefore(style, document.head.firstChild)
    } else {
      document.head.appendChild(style)
    }
  }

  // Create the button element
  const button = document.createElement('button')
  button.id = id

  // Set initial content
  button.innerHTML = `
    <div id="${id}-label" style="display: flex; align-items: center;">
      ${label}
    </div>
    <div style="border-radius: 50%; display: flex; align-items: center; justify-content: center;">
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
 * Adds shared button styles to the document if not already present
 */
function addSharedButtonStyles() {
  if (document.getElementById('header-buttons-shared-style')) return

  const style = document.createElement('style')
  style.id = 'header-buttons-shared-style'
  style.innerHTML = `
    .header-button {
      position: relative;
      border: none;
      border-radius: 999px;
      background-color: rgb(19, 20, 22);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: end;
      vertical-align: middle;
      padding: 5px 10px;
      height: 24px;
      box-sizing: border-box;
      color: #808893;
      margin-right: 8px;
    }

    .header-button:hover {
      color: rgb(150, 158, 170);
      background-color: rgba(0, 0, 0, 0.6);
    }

    .header-button-label {
      margin-right: 8px;
      font-size: 14px;
      line-height: 14px;
    }

    .header-button-icon {
      width: 13px;
      height: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-button-icon svg {
      width: 100%;
      height: 100%;
      vertical-align: middle;
      display: block;
    }
  `

  // Insert style at the beginning of head
  if (document.head.firstChild) {
    document.head.insertBefore(style, document.head.firstChild)
  } else {
    document.head.appendChild(style)
  }
}

/**
 * Inject a fullscreen toggle button into the header
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function injectFullscreenButton() {
  // SVG icons for fullscreen states
  const icons = {
    enter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M344 0L488 0c13.3 0 24 10.7 24 24l0 144c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39-87 87c-9.4 9.4-24.6 9.4-33.9 0l-32-32c-9.4-9.4-9.4-24.6 0-33.9l87-87L327 41c-6.9-6.9-8.9-17.2-5.2-26.2S334.3 0 344 0zM168 512L24 512c-13.3 0-24-10.7-24-24L0 344c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39 87-87c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8z"/></svg>`,
    exit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M439 7c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8l-144 0c-13.3 0-24-10.7-24-24l0-144c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39L439 7zM72 272l144 0c13.3 0 24 10.7 24 24l0 144c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39L73 505c-9.4 9.4-24.6 9.4-33.9 0L7 473c-9.4-9.4-9.4-24.6 0-33.9l87-87L55 313c-6.9-6.9-8.9-17.2-5.2-26.2s12.5-14.8 22.2-14.8z"/></svg>`,
  }

  // Add shared button styles
  addSharedButtonStyles()

  // Add fullscreen-specific styles
  addFullscreenStyles()

  // Function to update button content based on fullscreen state
  const updateFullscreenButtonContent = (button) => {
    // Query the fullscreen state from Electron
    ipcRenderer
      .invoke('isFullScreen')
      .then((isFullscreen) => {
        button.innerHTML = `
          <div id="fullscreen-button-label" style="display: flex; align-items: center;">
            ${isFullscreen ? 'Exit&nbsp;' : ''}Fullscreen
          </div>
          <div style="border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Toggle Fullscreen (F11)">
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
          <div id="fullscreen-button-label" style="display: flex; align-items: center;">
            Fullscreen
          </div>
          <div style="border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Toggle Fullscreen (F11)">
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
    styleId: 'fullscreen-button-style',
    styles: `
      #fullscreen-button {
        position: relative;
        border: none;
        border-radius: 999px;
        background-color: rgb(19, 20, 22);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: end;
        vertical-align: middle;
        padding: 5px 10px;
        height: 24px;
        box-sizing: border-box;
        color: #808893;
      }

      #fullscreen-button:hover {
        color: rgb(150, 158, 170);
        background-color: rgba(0, 0, 0, 0.6);
      }

      #fullscreen-button-label {
        margin-right: 8px;
        font-size: 14px;
        line-height: 14px;
      }

      #fullscreen-icon {
        width: 13px;
        height: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #fullscreen-icon svg {
        width: 100%;
        height: 100%;
        vertical-align: middle;
        display: block;
      }
    `,
    icons: icons,
  })
}

/**
 * Inject a sidebar toggle button into the header
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function injectSidebarButton() {
  // Simple rectangle SVG icons for sidebar states
  const icons = {
    hidden: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="CurrentColor" d="M44 31v2L32 45a2 2 0 0 1-2-3l10-10-10-10a2 2 0 0 1 2-3l12 12Z"/></svg>`,
    visible: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="currentColor" d="M30 33v-2l11-12a2 2 0 0 1 3 3L34 32l10 10a2 2 0 0 1-3 3L30 33Z"/></svg>`,
  }

  // Add shared button styles
  addSharedButtonStyles()

  // Add sidebar-specific styles
  const addSidebarStyles = () => {
    if (document.getElementById('sidebar-button-style')) return

    const style = document.createElement('style')
    style.id = 'sidebar-button-style'
    style.innerHTML = `
      #sidebar-button {
        position: relative;
        border: none;
        border-radius: 999px;
        background-color: rgb(19, 20, 22);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: end;
        vertical-align: middle;
        padding: 5px 10px;
        height: 24px;
        box-sizing: border-box;
        color: #808893;
      }

      #sidebar-button:hover {
        color: rgb(150, 158, 170);
        background-color: rgba(0, 0, 0, 0.6);
      }

      #sidebar-button-label {
        margin-right: 8px;
        font-size: 14px;
        line-height: 14px;
      }

      #sidebar-icon {
        width: 13px;
        height: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #sidebar-icon svg {
        width: 100%;
        height: 100%;
        vertical-align: middle;
        display: block;
      }
    `

    // Insert style at the beginning of head
    if (document.head.firstChild) {
      document.head.insertBefore(style, document.head.firstChild)
    } else {
      document.head.appendChild(style)
    }
  }

  // Add the sidebar styles
  addSidebarStyles()

  // Function to update button content based on sidebar state
  const updateSidebarButtonContent = async (button) => {
    try {
      // Get config to check current nav state
      const config = (await ipcRenderer.invoke('configLoad')) || {}
      const isNavHidden = config.hideNav === true

      button.innerHTML = `
        <div id="sidebar-button-label" style="display: flex; align-items: center;">
          ${isNavHidden ? 'Show' : 'Hide'} Nav
        </div>
        <div style="border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Toggle Sidebar">
          <div id="sidebar-icon">
            ${isNavHidden ? icons.hidden : icons.visible}
          </div>
        </div>
      `
    } catch (error) {
      utils.logError('Error getting sidebar state:', error)
      // Default fallback
      button.innerHTML = `
        <div id="sidebar-button-label" style="display: flex; align-items: center;">
          Toggle Sidebar
        </div>
        <div style="border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Toggle Sidebar">
          <div id="sidebar-icon">
            ${icons.visible}
          </div>
        </div>
      `
    }
  }

  // Function to toggle only the sidebar
  const toggleSidebar = () => {
    // Just call toggleNavigation, the button update is handled inside it now
    toggleNavigation({ toggleNav: true, toggleHeader: false })
  }

  // Use the generalized function to create the button
  return createHeaderButton({
    id: 'sidebar-button',
    label: 'Toggle Sidebar',
    onClick: toggleSidebar,
    updateContent: updateSidebarButtonContent,
    styleId: 'sidebar-button-style',
    styles: `
      #sidebar-button {
        position: relative;
        border: none;
        border-radius: 999px;
        background-color: rgb(19, 20, 22);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: end;
        vertical-align: middle;
        padding: 5px 10px;
        height: 24px;
        box-sizing: border-box;
        color: #808893;
      }

      #sidebar-button:hover {
        color: rgb(150, 158, 170);
        background-color: rgba(0, 0, 0, 0.6);
      }

      #sidebar-button-label {
        margin-right: 8px;
        font-size: 14px;
        line-height: 14px;
      }

      #sidebar-icon {
        width: 13px;
        height: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #sidebar-icon svg {
        width: 100%;
        height: 100%;
        vertical-align: middle;
        display: block;
      }
    `,
    icons: icons,
  })
}

/**
 * Adds fullscreen button styles to the document if not already present
 */
function addFullscreenStyles() {
  if (document.getElementById('fullscreen-button-style')) return

  const style = document.createElement('style')
  style.id = 'fullscreen-button-style'
  style.innerHTML = `
    #fullscreen-button {
      position: relative;
      border: none;
      border-radius: 999px;
      background-color: rgb(19, 20, 22);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: end;
      vertical-align: middle;
      padding: 5px 10px;
      height: 24px;
      box-sizing: border-box;
      color: #808893;
    }

    #fullscreen-button:hover {
      color: rgb(150, 158, 170);
      background-color: rgba(0, 0, 0, 0.6);
    }

    #fullscreen-button-label {
      margin-right: 8px;
      font-size: 14px;
      line-height: 14px;
    }

    #fullscreen-icon {
      width: 13px;
      height: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #fullscreen-icon svg {
      width: 100%;
      height: 100%;
      vertical-align: middle;
      display: block;
    }
  `

  // Insert style at the beginning of head
  if (document.head.firstChild) {
    document.head.insertBefore(style, document.head.firstChild)
  } else {
    document.head.appendChild(style)
  }
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
      handleDashboardButton().catch((error) => {
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
    await injectFullscreenButton()
    await injectSidebarButton()

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
  triggerDashboardNavigation,
  injectDashboardButton,
  addDashboardButtonStyles,
  handleDashboardButton,
  setDashboardButtonVisibility,
  toggleNavigation,
  initializeDashboardPage,
  setupKeyboardShortcuts,
  handleWidgetPanel,
  injectFullscreenButton,
  injectSidebarButton,
  addFullscreenStyles,
  toggleFullscreen,
  initializeCommonUI,
  applyUserNavigationPreferences,
  setupNavigationObserver,
  setupUrlChangeListener,
}
