const { ipcRenderer } = require('electron')
const utils = require('./utils')
const fs = require('fs')
const path = require('path')
const buttonStyles = require('./buttonStyles')

// Shared icon constants for navigation elements
const navIcons = {
  sidebar: {
    hidden: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="CurrentColor" d="M44 31v2L32 45a2 2 0 0 1-2-3l10-10-10-10a2 2 0 0 1 2-3l12 12Z"/></svg>`,
    visible: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" d="M64 8v48c0 4-4 8-8 8H8c-4 0-8-4-8-8V8c0-4 4-8 8-8h48c4 0 8 4 8 8ZM12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 41h32c2 0 4-2 4-4V8c0-2-2-4-4-4H24v56ZM12 31a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path fill="currentColor" d="M30 33v-2l11-12a2 2 0 0 1 3 3L34 32l10 10a2 2 0 0 1-3 3L30 33Z"/></svg>`,
  },
}

// Header toggle icons (sidebar icons rotated 90 degrees)
const headerToggleIcons = {
  up: `
  <div style="display: flex; align-items: center; flex-direction: column; font-size: 11px;">
     <div style="transform: scaleY(0.66) rotate(90deg); width: 24px; height: 24px; padding: 2px;">
      ${navIcons.sidebar.visible}
    </div>
  </div>`,
  down: `
  <div style="display: flex; align-items: center; flex-direction: column; font-size: 11px;">
     <div style="transform: scaleY(0.66) rotate(90deg); width: 24px; height: 24px; padding: 2px;">
      ${navIcons.sidebar.hidden}
    </div>
  </div>`,
}

// Fullscreen icons
const fullscreenIcons = {
  enter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M344 0L488 0c13.3 0 24 10.7 24 24l0 144c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39-87 87c-9.4 9.4-24.6 9.4-33.9 0l-32-32c-9.4-9.4-9.4-24.6 0-33.9l87-87L327 41c-6.9-6.9-8.9-17.2-5.2-26.2S334.3 0 344 0zM168 512L24 512c-13.3 0-24-10.7-24-24L0 344c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39 87-87c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8z"/></svg>`,
  exit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M439 7c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8l-144 0c-13.3 0-24-10.7-24-24l0-144c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39L439 7zM72 272l144 0c13.3 0 24 10.7 24 24l0 144c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39L73 505c-9.4 9.4-24.6 9.4-33.9 0L7 473c-9.4-9.4-9.4-24.6 0-33.9l87-87L55 313c-6.9-6.9-8.9-17.2-5.2-26.2s12.5-14.8 22.2-14.8z"/></svg>`,
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
    buttonStyles.injectButtonStyles()
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
 * Inject a fullscreen toggle button into the header.
 * @param {Function} onClick - Click handler (provided by orchestration layer)
 * @returns {Promise<Function|null>} Updater function `(state) => void`, or null on failure
 */
async function injectFullscreenButton(onClick) {
  // Ensure button styles are present
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
  }

  // Updater that will be returned and registered with the controller
  const updater = (state) => {
    const btn = document.getElementById('fullscreen-button')
    if (!btn) return
    btn.innerHTML = `
      <div id="fullscreen-button-label" class="header-button-label">
        ${state.isFullscreen ? 'Exit&nbsp;' : ''}Fullscreen
      </div>
      <div class="header-button-icon" title="Toggle Fullscreen (F11)">
        <div id="fullscreen-icon">
          ${state.isFullscreen ? fullscreenIcons.exit : fullscreenIcons.enter}
        </div>
      </div>
    `
  }

  // Initial content updater for createHeaderButton (uses IPC query for first render)
  const initialUpdate = (button) => {
    ipcRenderer
      .invoke('isFullScreen')
      .then((isFullscreen) => {
        button.innerHTML = `
          <div id="fullscreen-button-label" class="header-button-label">
            ${isFullscreen ? 'Exit&nbsp;' : ''}Fullscreen
          </div>
          <div class="header-button-icon" title="Toggle Fullscreen (F11)">
            <div id="fullscreen-icon">
              ${isFullscreen ? fullscreenIcons.exit : fullscreenIcons.enter}
            </div>
          </div>
        `
      })
      .catch((error) => {
        utils.logError('Error getting fullscreen state:', error)
      })
  }

  const created = await createHeaderButton({
    id: 'fullscreen-button',
    label: 'Fullscreen',
    onClick: onClick || toggleFullscreen,
    updateContent: initialUpdate,
  })

  return created ? updater : null
}

/**
 * Inject a sidebar toggle button into the header.
 * @param {Function} onClick - Click handler (provided by orchestration layer)
 * @returns {Promise<Function|null>} Updater function `(state) => void`, or null on failure
 */
async function injectSidebarButton(onClick) {
  // Ensure button styles are present
  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
  }

  // Updater that reads authoritative state — no IPC or DOM re-reads needed
  const updater = (state) => {
    const btn = document.getElementById('sidebar-button')
    if (!btn) return
    btn.innerHTML = `
      <div id="sidebar-button-label" class="header-button-label">
        ${state.navHidden ? 'Show' : 'Hide'} Nav
      </div>
      <div class="header-button-icon" title="Toggle Sidebar">
        <div id="sidebar-icon">
          ${state.navHidden ? navIcons.sidebar.hidden : navIcons.sidebar.visible}
        </div>
      </div>
    `
  }

  // Initial content updater for createHeaderButton (uses IPC query for first render)
  const initialUpdate = async (button) => {
    try {
      const config = (await ipcRenderer.invoke('configLoad')) || {}
      const isNavHidden = config.hideNav === true
      button.innerHTML = `
        <div id="sidebar-button-label" class="header-button-label">
          ${isNavHidden ? 'Show' : 'Hide'} Nav
        </div>
        <div class="header-button-icon" title="Toggle Sidebar">
          <div id="sidebar-icon">
            ${isNavHidden ? navIcons.sidebar.hidden : navIcons.sidebar.visible}
          </div>
        </div>
      `
    } catch (error) {
      utils.logError('Error getting sidebar state:', error)
    }
  }

  const created = await createHeaderButton({
    id: 'sidebar-button',
    label: 'Toggle Sidebar',
    onClick: onClick || (() => {}),
    updateContent: initialUpdate,
    icons: navIcons.sidebar,
  })

  return created ? updater : null
}

/**
 * Toggles fullscreen mode via IPC to the main process
 */
function toggleFullscreen() {
  ipcRenderer.send('toggleFullscreen')
}

/**
 * Helper for dashboard button navigation
 */
function triggerDashboardNavigation() {
  const protectIndex = document.URL.indexOf('/protect/')
  const baseUrl = document.URL.substring(0, protectIndex + '/protect/'.length)
  const dashboardUrl = baseUrl + 'dashboard'

  const dashboardLink = document.querySelector('a[href*="/protect/dashboard"]')

  if (dashboardLink) dashboardLink.click()
  else window.location.href = dashboardUrl
}

/**
 * Dashboard button overlay function
 * Creates and injects the dashboard button into the DOM
 */
function injectDashboardButton() {
  if (document.getElementById('dashboard-button')) return

  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
  }

  const button = document.createElement('button')
  button.id = 'dashboard-button'
  button.className = 'dashboard-button'
  button.style.display = 'none'

  const svgPath = path.join(__dirname, '../../img/dashboard-icon.svg')
  let dashboardSvg
  try {
    dashboardSvg = fs.readFileSync(svgPath, 'utf8')
  } catch (error) {
    console.error('Error reading dashboard SVG:', error)
    dashboardSvg = '<div>Dashboard</div>'
  }

  button.innerHTML = `
  <div style="display: flex;align-items: center;">
    <div style="margin-right:4px; font-size:18px;">←</div>
    ${dashboardSvg}
  </div>`
  button.onclick = triggerDashboardNavigation

  document.body.appendChild(button)

  const showNavPopup = document.createElement('div')
  showNavPopup.id = 'show-nav-popup'
  showNavPopup.className = 'nav-popup'
  showNavPopup.innerHTML = `<div><kbd>Esc</kbd> Toggle Navigation</div>`
  document.body.appendChild(showNavPopup)

  setTimeout(() => {
    const popup = document.getElementById('show-nav-popup')
    if (popup) popup.remove()
  }, 5000)

  return button
}

/**
 * Handle dashboard button visibility.
 * Simplified: no global flags, just check DOM state directly.
 * @returns {Promise<void>}
 */
async function handleDashboardButton() {
  injectDashboardButton()

  if (document.URL.includes('/protect/dashboard')) {
    setDashboardButtonVisibility(false)
    return
  }

  try {
    await utils.waitUntil(
      () => document.querySelector('header') !== null && document.querySelector('nav') !== null,
      2000,
    )
  } catch {
    setDashboardButtonVisibility(true)
    return
  }

  const nav = document.querySelector('nav')
  let isNavVisible = false

  if (nav) {
    const navStyle = window.getComputedStyle(nav)
    isNavVisible = navStyle.display !== 'none' && navStyle.visibility !== 'hidden' && navStyle.opacity !== '0'

    if (nav.offsetWidth === 0 || nav.offsetHeight === 0) {
      isNavVisible = false
    }
  }

  let hasDashboardLink = false
  if (isNavVisible && nav) {
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

  const shouldShowButton = !isNavVisible || !hasDashboardLink
  setDashboardButtonVisibility(shouldShowButton)
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
 * Generalizes button creation for navigation sidebar buttons.
 * Simplified: no per-button MutationObserver — the controller + ensureButtonsInjected handles re-injection.
 * @param {Object} options - Button creation options
 * @param {string} options.id - Button ID
 * @param {string} options.tooltip - Button tooltip text
 * @param {Function} options.onClick - Click handler function
 * @param {string} options.content - HTML content for the button (SVG icon, etc.)
 * @returns {Promise<boolean>} True if button was injected successfully
 */
async function createNavButton(options) {
  const { id, tooltip, onClick, content } = options

  if (!document.getElementById('unifi-protect-viewer-button-styles')) {
    buttonStyles.injectButtonStyles()
  }

  // Avoid duplicate insertions
  if (document.getElementById(id)) {
    return true
  }

  try {
    await utils.waitUntil(() => document.querySelector('nav') !== null, 5000)

    // Re-check after wait
    if (document.getElementById(id)) {
      return true
    }

    const nav = document.querySelector('nav')
    if (!nav) return false

    const buttonElement = document.createElement('button')
    buttonElement.id = id
    buttonElement.className = 'custom-nav-button'
    buttonElement.title = tooltip || ''
    buttonElement.setAttribute('role', 'button')
    buttonElement.innerHTML = content
    buttonElement.onclick = onClick

    nav.prepend(buttonElement)
    return true
  } catch (error) {
    utils.logError(`Error injecting ${id} nav button`, error)
    return false
  }
}

/**
 * Inject the header toggle button into the nav sidebar.
 * @param {Function} onClick - Click handler (provided by orchestration layer)
 * @returns {Promise<Function|null>} Updater function `(state) => void`, or null on failure
 */
async function injectHeaderToggleButton(onClick) {
  // Updater reads authoritative state — no DOM re-read needed (fixes the chevron bug)
  const updater = (state) => {
    const btn = document.getElementById('header-toggle-button')
    if (!btn) return
    btn.innerHTML = state.headerHidden ? headerToggleIcons.down : headerToggleIcons.up
  }

  const created = await createNavButton({
    id: 'header-toggle-button',
    tooltip: 'Toggle Header',
    onClick: onClick || (() => {}),
    content: headerToggleIcons.up,
  })

  return created ? updater : null
}

module.exports = {
  createHeaderButton,
  createNavButton,
  injectFullscreenButton,
  injectSidebarButton,
  injectHeaderToggleButton,
  toggleFullscreen,
  triggerDashboardNavigation,
  injectDashboardButton,
  handleDashboardButton,
  setDashboardButtonVisibility,
}
