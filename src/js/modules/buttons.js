const { ipcRenderer } = require('electron')
const utils = require('./utils')
const buttonStyles = require('./buttonStyles')
const { DOM_ELEMENT_WAIT_MS, DASHBOARD_BUTTON_WAIT_MS, NAV_POPUP_DURATION_MS } = require('./constants')

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

// Dashboard icon
const dashboardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor"><rect x="3" y="3" width="18" height="15" rx="1" fill-opacity=".2"/><path fill-rule="evenodd" clip-rule="evenodd" d="M20 10V4h-7.5v6H20Zm-8.5 0V4H4v6h7.5ZM4 3h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm0 8h7.5v6H4v-6Zm16 6h-7.5v-6H20v6Zm-2.5 3a.5.5 0 0 1 0 1h-11a.5.5 0 0 1 0-1h11Z"/></svg>`

// Fullscreen icons
const fullscreenIcons = {
  enter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M344 0h144c13 0 24 11 24 24v144a24 24 0 0 1-41 17l-39-39-87 87c-9 9-25 9-34 0l-32-32c-9-9-9-25 0-34l87-87-39-39a24 24 0 0 1 17-41M168 512H24c-13 0-24-11-24-24V344a24 24 0 0 1 41-17l39 39 87-87c9-9 25-9 34 0l32 32c9 9 9 25 0 34l-87 87 39 39a24 24 0 0 1-17 41"/></svg>`,
  exit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M439 7c9-9 25-9 34 0l32 32c9 9 9 25 0 34l-87 87 39 39a24 24 0 0 1-17 41H296c-13 0-24-11-24-24V72a24 24 0 0 1 41-17l39 39zM72 272h144c13 0 24 11 24 24v144a24 24 0 0 1-41 17l-39-39-87 87c-9 9-25 9-34 0L7 473c-9-9-9-25 0-34l87-87-39-39a24 24 0 0 1 17-41"/></svg>`,
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
    await utils.waitUntil(() => document.querySelector('header') !== null, DOM_ELEMENT_WAIT_MS)

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

  button.innerHTML = `
  <div style="display: flex;align-items: center;">
    <div style="margin-right:4px; font-size:18px;">←</div>
    ${dashboardIcon}
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
  }, NAV_POPUP_DURATION_MS)

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
      DASHBOARD_BUTTON_WAIT_MS,
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
    await utils.waitUntil(() => document.querySelector('nav') !== null, DOM_ELEMENT_WAIT_MS)

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
