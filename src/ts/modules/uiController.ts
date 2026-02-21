/**
 * UIController - Centralized state management for header/nav/fullscreen visibility.
 *
 * This module owns all UI visibility state and serves as the hub for all toggles,
 * enforcement, and button icon updates.
 *
 * Dependencies flow strictly one-way:
 *   preload.ts -> uiController.ts -> utils.ts, buttonStyles.ts
 *   The controller does NOT import buttons.ts.
 */

import { setStyle, logError } from './utils'
import { waitUntil } from './utils'
import * as buttonStyles from './buttonStyles'
import { DOM_ELEMENT_WAIT_MS, ENFORCEMENT_BURST_INTERVAL_MS, ENFORCEMENT_BURST_COUNT } from './constants'
import type { UIState, UIInternalState } from '../types/state'
import type { ButtonUpdater } from '../types/buttons'

/** Dependencies injected via initialize() for testability */
interface UiControllerDeps {
  ipcRenderer?: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    send: (channel: string, ...args: unknown[]) => void
    on: (channel: string, listener: (...args: unknown[]) => void) => void
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => void
  }
}

// IPC bridge — set via initialize() for testability, falls back to electron-ipc
let ipc: UiControllerDeps['ipcRenderer'] | null = null

// --- Internal state ---
const state: UIInternalState = {
  navHidden: false,
  headerHidden: false,
  isFullscreen: false,
  toggleInProgress: false,
  initialized: false,
}

// --- Button registry & listeners ---
const buttonRegistry = new Map<string, ButtonUpdater>()
const stateChangeListeners: Array<(state: UIState) => void> = []

// --- Observer / timer tracking ---
let navHeaderObserver: MutationObserver | null = null
let bodyObserver: MutationObserver | null = null
let enforcementTimer: ReturnType<typeof setInterval> | null = null
let fullscreenHandler: ((...args: unknown[]) => void) | null = null
let trackedNav: Element | null = null
let trackedHeader: Element | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function notifyButtons(): void {
  const snap = getState()
  for (const [id, updateFn] of buttonRegistry) {
    try {
      updateFn(snap)
    } catch (err) {
      logError(`Error notifying button "${id}":`, err)
    }
  }
}

function notifyStateChangeListeners(): void {
  const snap = getState()
  for (const listener of stateChangeListeners) {
    try {
      listener(snap)
    } catch (err) {
      logError('Error in state change listener:', err)
    }
  }
}

function applyNavState(): void {
  const nav = document.querySelector('nav')
  if (nav) setStyle(nav as HTMLElement, 'display', state.navHidden ? 'none' : 'flex')
}

function applyHeaderState(): void {
  const header = document.querySelector('header')
  if (header) setStyle(header as HTMLElement, 'display', state.headerHidden ? 'none' : 'flex')
}

async function persistState(): Promise<void> {
  const settings: Record<string, boolean> = {}
  settings.hideNav = state.navHidden
  settings.hideHeader = state.headerHidden
  await ipc!.invoke('configSavePartial', settings)
}

function notifyMainProcess(): void {
  ipc!.send('update-ui-state', {
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
export async function initialize(deps: UiControllerDeps = {}): Promise<void> {
  // Set IPC bridge (injected for tests, otherwise from electron-ipc)
  ipc = deps.ipcRenderer || (require('./electron-ipc') as typeof import('./electron-ipc')).ipcRenderer

  // a. Load config
  const config = ((await ipc.invoke('configLoad')) || {}) as Record<string, unknown>
  state.navHidden = config.hideNav === true
  state.headerHidden = config.hideHeader === true

  // b. Load fullscreen state
  state.isFullscreen = (await ipc.invoke('isFullScreen')) as boolean

  // c. Wait for nav + header to exist (5s timeout)
  try {
    await waitUntil(
      () => document.querySelector('nav') !== null && document.querySelector('header') !== null,
      DOM_ELEMENT_WAIT_MS,
    )
  } catch {
    // Elements may not exist on non-protect pages; proceed anyway
  }

  // d. Apply loaded state to DOM
  enforceCurrentState()

  // e. Register fullscreen IPC listener
  fullscreenHandler = (_event: unknown, isFullscreen: unknown) => {
    if (state.isFullscreen === isFullscreen) return // dedup
    state.isFullscreen = isFullscreen as boolean
    notifyButtons()
    notifyStateChangeListeners()
  }
  ipc.on('fullscreen-change', fullscreenHandler)

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
export function getState(): UIState {
  return {
    navHidden: state.navHidden,
    headerHidden: state.headerHidden,
    isFullscreen: state.isFullscreen,
  }
}

// --- Toggles ---

export async function toggleAll(): Promise<void> {
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
    logError('Error toggling all:', err)
  } finally {
    state.toggleInProgress = false
  }
}

export async function toggleNav(): Promise<void> {
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
    logError('Error toggling nav:', err)
  } finally {
    state.toggleInProgress = false
  }
}

export async function toggleHeader(): Promise<void> {
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
    logError('Error toggling header:', err)
  } finally {
    state.toggleInProgress = false
  }
}

// --- Button registration ---

export function registerButton(id: string, updateFn: ButtonUpdater): void {
  buttonRegistry.set(id, updateFn)
  try {
    updateFn(getState())
  } catch (err) {
    logError(`Error during initial button sync for "${id}":`, err)
  }
}

export function unregisterButton(id: string): void {
  buttonRegistry.delete(id)
}

export function unregisterAllButtons(): void {
  buttonRegistry.clear()
}

// --- General state change listeners ---

export function onStateChange(listener: (state: UIState) => void): () => void {
  stateChangeListeners.push(listener)
  return () => {
    const idx = stateChangeListeners.indexOf(listener)
    if (idx !== -1) stateChangeListeners.splice(idx, 1)
  }
}

// --- Enforcement ---

export function enforceCurrentState(): void {
  if (!state.initialized && !state.navHidden && !state.headerHidden) return
  applyNavState()
  applyHeaderState()
}

export function startEnforcement(): void {
  stopEnforcement()
  let count = 0
  enforcementTimer = setInterval(() => {
    if (count < ENFORCEMENT_BURST_COUNT) {
      enforceCurrentState()
      count++
    } else {
      stopEnforcement()
    }
  }, ENFORCEMENT_BURST_INTERVAL_MS)
}

function stopEnforcement(): void {
  if (enforcementTimer) {
    clearInterval(enforcementTimer)
    enforcementTimer = null
  }
}

/**
 * Called by navigation monitor when URL changes.
 * Re-enforces state and notifies listeners (which triggers button re-injection).
 */
export function handleUrlChange(_oldUrl: string, _newUrl: string): void {
  if (!state.initialized) return
  enforceCurrentState()
  startEnforcement()
  notifyButtons()
  notifyStateChangeListeners()
}

// --- Observer setup (idempotent) ---

function setupObserver(): void {
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

  if (document.body) {
    bodyObserver = new MutationObserver(() => {
      const currentNav = document.querySelector('nav')
      const currentHeader = document.querySelector('header')

      const navReplaced = currentNav !== trackedNav
      const headerReplaced = currentHeader !== trackedHeader

      if (navReplaced || headerReplaced) {
        trackedNav = currentNav
        trackedHeader = currentHeader

        if (currentNav || currentHeader) {
          setupObserver()
          enforceCurrentState()
          notifyStateChangeListeners()
        }
      }
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
  }
}

// --- Cleanup ---

export function destroy(): void {
  if (navHeaderObserver) {
    navHeaderObserver.disconnect()
    navHeaderObserver = null
  }
  if (bodyObserver) {
    bodyObserver.disconnect()
    bodyObserver = null
  }
  stopEnforcement()
  if (fullscreenHandler && ipc) {
    ipc.removeListener('fullscreen-change', fullscreenHandler)
    fullscreenHandler = null
  }
  buttonRegistry.clear()
  stateChangeListeners.length = 0
  trackedNav = null
  trackedHeader = null
  ipc = null
  state.navHidden = false
  state.headerHidden = false
  state.isFullscreen = false
  state.toggleInProgress = false
  state.initialized = false
}
