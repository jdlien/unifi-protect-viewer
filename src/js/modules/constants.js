/**
 * Shared timing constants and configuration values.
 *
 * Centralizes magic numbers so they're documented in one place
 * and easy to tune or reference.
 */

// --- General polling / waitUntil defaults ---
exports.DEFAULT_WAIT_TIMEOUT_MS = 30000
exports.DEFAULT_WAIT_INTERVAL_MS = 20

// --- UI element wait timeouts ---
exports.DOM_ELEMENT_WAIT_MS = 5000 // Wait for nav, header, widget panel, etc.
exports.DASHBOARD_BUTTON_WAIT_MS = 2000 // Shorter wait for dashboard button visibility check

// --- Enforcement ---
exports.ENFORCEMENT_BURST_INTERVAL_MS = 300
exports.ENFORCEMENT_BURST_COUNT = 10

// --- Style checker ---
exports.STYLE_CHECKER_INTERVAL_MS = 5000

// --- Widget panel ---
exports.WIDGET_TRANSITION_MS = 350

// --- Navigation ---
exports.DASHBOARD_RETRY_DELAY_MS = 500

// --- Protect page transition ---
exports.PROTECT_PAGE_POLL_MS = 500
exports.PROTECT_PAGE_MAX_WAIT_MS = 120000

// --- Update listeners ---
exports.UPDATE_LISTENER_DELAY_MS = 5000

// --- Nav popup ---
exports.NAV_POPUP_DURATION_MS = 5000

// --- Camera zoom ---
exports.ZOOM_WAIT_TIMEOUT_MS = 2000

// --- Auth ---
exports.LOGIN_ATTEMPTS_RESET_MS = 30 * 60 * 1000 // 30 minutes
exports.LOGIN_SUCCESS_CHECK_INTERVAL_MS = 500
exports.LOGIN_SUCCESS_MAX_WAIT_MS = 30000
exports.POST_LOGIN_DASHBOARD_DELAY_MS = 1000
exports.POST_LOGIN_DASHBOARD_RETRY_DELAY_MS = 2000
