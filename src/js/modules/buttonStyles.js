/**
 * Button styles module - contains styling for injected UI buttons
 * and functions to apply those styles to the DOM
 */

const utils = require('./utils')

// Button styles as a string constant
const BUTTON_STYLES = /*css*/ `
/* Header UI buttons (fullscreen, sidebar toggle, etc) */
.header-button {
  position: relative;
  border: none;
  border-radius: 999px;
  background-color: rgb(19, 20, 22);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-end;
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

/* Dashboard button overlay */
.dashboard-button {
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

.dashboard-button:hover {
  background-color: rgba(0, 0, 0, 0.7);
  color: rgb(153, 160, 168);
}

/* Keyboard shortcut popup */
.nav-popup {
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

.nav-popup kbd {
  color: white;
  display: inline-block;
  margin-right: 2px;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid rgb(183, 188, 194);
  padding: 1px 2px;
}
`

/**
 * Injects button styles into the document head
 * This is needed because we're injecting UI elements into the UniFi Protect app
 */
function injectButtonStyles() {
  // Check if styles are already injected
  if (document.getElementById('unifi-protect-viewer-button-styles')) {
    return
  }

  try {
    // Create and inject the style element
    const styleElement = document.createElement('style')
    styleElement.id = 'unifi-protect-viewer-button-styles'
    styleElement.textContent = BUTTON_STYLES

    // Insert at the beginning of head for higher specificity
    if (document.head.firstChild) {
      document.head.insertBefore(styleElement, document.head.firstChild)
    } else {
      document.head.appendChild(styleElement)
    }

    // utils.logger.debug('Button styles injected successfully')
  } catch (error) {
    utils.logError('Error injecting button styles:', error)
  }
}

module.exports = {
  injectButtonStyles,
  BUTTON_STYLES, // Export the styles too in case they're needed elsewhere
}
