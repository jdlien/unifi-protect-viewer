/**
 * UIController - Centralized state management for header/nav/fullscreen visibility.
 *
 * This module owns all UI visibility state and serves as the hub for all toggles,
 * enforcement, and button icon updates.
 *
 * Dependencies flow strictly one-way:
 *   preload.js -> uiController.js -> utils.js, buttonStyles.js
 *   The controller does NOT import buttons.js.
 */

const { ipcRenderer } = require('electron')
const utils = require('./utils')
const buttonStyles = require('./buttonStyles')

// --- Internal state ---
const state = {
  navHidden: false,
  headerHidden: false,
  isFullscreen: false,
  toggleInProgress: false,
  initialized: false,
}

// --- Button registry & listeners ---
const buttonRegistry = new Map()
const stateChangeListeners = []

// --- Observer / timer tracking ---
let navHeaderObserver = null
let bodyObserver = null
let enforcementTimer = null
let fullscreenHandler = null
let trackedNav = null
let trackedHeader = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function notifyButtons() {
  const snap = getState()
  for (const [id, updateFn] of buttonRegistry) {
    try {
      updateFn(snap)
    } catch (err) {
      utils.logError(`Error notifying button "${id}":`, err)
    }
  }
}

function notifyStateChangeListeners() {
  const snap = getState()
  for (const listener of stateChangeListeners) {
    try {
      listener(snap)
    } catch (err) {
      utils.logError('Error in state change listener:', err)
    }
  }
}

function applyNavState() {
  const nav = document.querySelector('nav')
  if (nav) utils.setStyle(nav, 'display', state.navHidden ? 'none' : 'flex')
}

function applyHeaderState() {
  const header = document.querySelector('header')
  if (header) utils.setStyle(header, 'display', state.headerHidden ? 'none' : 'flex')
}

async function persistState() {
  const settings = {}
  settings.hideNav = state.navHidden
  settings.hideHeader = state.headerHidden
  await ipcRenderer.invoke('configSavePartial', settings)
}

function notifyMainProcess() {
  ipcRenderer.send('update-ui-state', {
    navHidden: state.navHidden,
    headerHidden: state.headerHidden,
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads config, sets state, waits for DOM elements, applies state,
 * sets up observer + enforcement. Must be awaited before button injection.
 */
async function initialize() {
  // a. Load config
  const config = (await ipcRenderer.invoke('configLoad')) || {}
  state.navHidden = config.hideNav === true
  state.headerHidden = config.hideHeader === true

  // b. Load fullscreen state
  state.isFullscreen = await ipcRenderer.invoke('isFullScreen')

  // c. Wait for nav + header to exist (5s timeout)
  try {
    await utils.waitUntil(
      () => document.querySelector('nav') !== null && document.querySelector('header') !== null,
      5000,
    )
  } catch {
    // Elements may not exist on non-protect pages; proceed anyway
  }

  // d. Apply loaded state to DOM
  enforceCurrentState()

  // e. Register fullscreen IPC listener
  fullscreenHandler = (_event, isFullscreen) => {
    if (state.isFullscreen === isFullscreen) return // dedup
    state.isFullscreen = isFullscreen
    notifyButtons()
    notifyStateChangeListeners()
  }
  ipcRenderer.on('fullscreen-change', fullscreenHandler)

  // f. Set up MutationObserver
  setupObserver()

  // g. Burst enforcement for initial settling
  startEnforcement()

  // h. Mark ready
  state.initialized = true

  // i. Sync menu labels with persisted state
  notifyMainProcess()
}

/** Returns a shallow copy of the current state */
function getState() {
  return {
    navHidden: state.navHidden,
    headerHidden: state.headerHidden,
    isFullscreen: state.isFullscreen,
  }
}

// --- Toggles ---

async function toggleAll() {
  if (!state.initialized) return
  if (state.toggleInProgress) return
  state.toggleInProgress = true
  try {
    const allHidden = state.navHidden && state.headerHidden
    if (allHidden) {
      state.navHidden = false
      state.headerHidden = false
    } else {
      state.navHidden = true
      state.headerHidden = true
    }
    applyNavState()
    applyHeaderState()
    notifyButtons()
    notifyStateChangeListeners()
    notifyMainProcess()
    await persistState()
  } catch (err) {
    utils.logError('Error toggling all:', err)
  } finally {
    state.toggleInProgress = false
  }
}

async function toggleNav() {
  if (!state.initialized) return
  if (state.toggleInProgress) return
  state.toggleInProgress = true
  try {
    state.navHidden = !state.navHidden
    applyNavState()
    notifyButtons()
    notifyStateChangeListeners()
    notifyMainProcess()
    await persistState()
  } catch (err) {
    utils.logError('Error toggling nav:', err)
  } finally {
    state.toggleInProgress = false
  }
}

async function toggleHeader() {
  if (!state.initialized) return
  if (state.toggleInProgress) return
  state.toggleInProgress = true
  try {
    state.headerHidden = !state.headerHidden
    applyHeaderState()
    notifyButtons()
    notifyStateChangeListeners()
    notifyMainProcess()
    await persistState()
  } catch (err) {
    utils.logError('Error toggling header:', err)
  } finally {
    state.toggleInProgress = false
  }
}

// --- Button registration ---

function registerButton(id, updateFn) {
  buttonRegistry.set(id, updateFn)
  // Immediately sync the new button with current state
  try {
    updateFn(getState())
  } catch (err) {
    utils.logError(`Error during initial button sync for "${id}":`, err)
  }
}

function unregisterButton(id) {
  buttonRegistry.delete(id)
}

function unregisterAllButtons() {
  buttonRegistry.clear()
}

// --- General state change listeners ---

function onStateChange(listener) {
  stateChangeListeners.push(listener)
  // Return unsubscribe function
  return () => {
    const idx = stateChangeListeners.indexOf(listener)
    if (idx !== -1) stateChangeListeners.splice(idx, 1)
  }
}

// --- Enforcement ---

function enforceCurrentState() {
  if (!state.initialized && !state.navHidden && !state.headerHidden) return
  applyNavState()
  applyHeaderState()
}

function startEnforcement() {
  stopEnforcement()
  let count = 0
  enforcementTimer = setInterval(() => {
    if (count < 10) {
      enforceCurrentState()
      count++
    } else {
      stopEnforcement()
    }
  }, 300)
}

function stopEnforcement() {
  if (enforcementTimer) {
    clearInterval(enforcementTimer)
    enforcementTimer = null
  }
}

/**
 * Called by navigation monitor when URL changes.
 * Re-enforces state and notifies listeners (which triggers button re-injection).
 */
function handleUrlChange(oldUrl, newUrl) {
  if (!state.initialized) return
  enforceCurrentState()
  startEnforcement()
  notifyButtons()
  notifyStateChangeListeners()
}

// --- Observer setup (idempotent) ---

function setupObserver() {
  // Disconnect existing observers before re-creating
  if (navHeaderObserver) {
    navHeaderObserver.disconnect()
    navHeaderObserver = null
  }
  if (bodyObserver) {
    bodyObserver.disconnect()
    bodyObserver = null
  }

  const nav = document.querySelector('nav')
  const header = document.querySelector('header')

  // Track current DOM references to detect React replacements
  trackedNav = nav
  trackedHeader = header

  if (nav || header) {
    navHeaderObserver = new MutationObserver(() => {
      if (!state.toggleInProgress) {
        enforceCurrentState()
      }
    })

    if (nav) {
      navHeaderObserver.observe(nav, { attributes: true, attributeFilter: ['style', 'class'] })
    }
    if (header) {
      navHeaderObserver.observe(header, { attributes: true, attributeFilter: ['style', 'class'] })
    }
  }

  // Watch body for React re-renders that replace nav/header elements
  if (document.body) {
    bodyObserver = new MutationObserver(() => {
      const currentNav = document.querySelector('nav')
      const currentHeader = document.querySelector('header')

      // Only act when elements are actually replaced (different DOM nodes)
      const navReplaced = currentNav !== trackedNav
      const headerReplaced = currentHeader !== trackedHeader

      if (navReplaced || headerReplaced) {
        trackedNav = currentNav
        trackedHeader = currentHeader

        if (currentNav || currentHeader) {
          setupObserver()
          enforceCurrentState()
          // Trigger button re-injection since container elements were replaced
          notifyStateChangeListeners()
        }
      }
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
  }
}

// --- Cleanup ---

function destroy() {
  if (navHeaderObserver) {
    navHeaderObserver.disconnect()
    navHeaderObserver = null
  }
  if (bodyObserver) {
    bodyObserver.disconnect()
    bodyObserver = null
  }
  stopEnforcement()
  if (fullscreenHandler) {
    ipcRenderer.removeListener('fullscreen-change', fullscreenHandler)
    fullscreenHandler = null
  }
  buttonRegistry.clear()
  stateChangeListeners.length = 0
  trackedNav = null
  trackedHeader = null
  state.initialized = false
}

module.exports = {
  initialize,
  getState,
  toggleAll,
  toggleNav,
  toggleHeader,
  registerButton,
  unregisterButton,
  unregisterAllButtons,
  onStateChange,
  enforceCurrentState,
  startEnforcement,
  handleUrlChange,
  destroy,
}
