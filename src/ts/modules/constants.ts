/**
 * Shared timing constants and configuration values.
 *
 * Centralizes magic numbers so they're documented in one place
 * and easy to tune or reference.
 */

// --- General polling / waitUntil defaults ---
export const DEFAULT_WAIT_TIMEOUT_MS = 30000
export const DEFAULT_WAIT_INTERVAL_MS = 20

// --- UI element wait timeouts ---
export const DOM_ELEMENT_WAIT_MS = 5000 // Wait for nav, header, widget panel, etc.
export const DASHBOARD_BUTTON_WAIT_MS = 2000 // Shorter wait for dashboard button visibility check

// --- Enforcement ---
export const ENFORCEMENT_BURST_INTERVAL_MS = 300
export const ENFORCEMENT_BURST_COUNT = 10

// --- Style checker ---
export const STYLE_CHECKER_INTERVAL_MS = 5000

// --- Widget panel ---
export const WIDGET_TRANSITION_MS = 350

// --- Navigation ---
export const DASHBOARD_RETRY_DELAY_MS = 500

// --- Protect page transition ---
export const PROTECT_PAGE_POLL_MS = 500
export const PROTECT_PAGE_MAX_WAIT_MS = 120000

// --- Update listeners ---
export const UPDATE_LISTENER_DELAY_MS = 5000

// --- Nav popup ---
export const NAV_POPUP_DURATION_MS = 5000

// --- Camera zoom ---
export const ZOOM_WAIT_TIMEOUT_MS = 2000

// --- Auth ---
export const LOGIN_ATTEMPTS_RESET_MS = 30 * 60 * 1000 // 30 minutes
export const LOGIN_SUCCESS_CHECK_INTERVAL_MS = 500
export const LOGIN_SUCCESS_MAX_WAIT_MS = 30000
export const POST_LOGIN_DASHBOARD_DELAY_MS = 1000
export const POST_LOGIN_DASHBOARD_RETRY_DELAY_MS = 2000
