const { ipcRenderer } = require('electron')
const utils = require('./utils')

/**
 * Fullscreen view modification function to customize the LiveView UI.
 * Only compatible with UniFi Protect 5.0 and later.
 */
async function handleLiveView() {
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

  // Apply navigation visibility via the centralized controller
  const uiController = require('./uiController')
  uiController.enforceCurrentState()

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
}

/**
 * Initialize dashboard page with UI customizations
 * @returns {boolean} True if initialization was successful
 */
function initializeDashboardPage() {
  const dashboard = require('./dashboard.js')

  try {
    dashboard.initializeDashboard()
    return true
  } catch (error) {
    utils.logError('Error delegating to dashboard module:', error)
    return false
  }
}

/**
 * Adjust the widget panel button appearance
 * @returns {Promise<boolean>} True if operation was successful
 */
async function handleWidgetPanel() {
  try {
    await utils.waitUntil(() => {
      return (
        document.querySelector('[class*="dashboard__Widgets"]') !== null &&
        document.querySelector('[class*="dashboard__StyledExpandButton"] button') !== null
      )
    }, 5000)

    const expandButton = document.querySelector('[class*="dashboard__StyledExpandButton"] button')
    utils.setStyle(expandButton, 'opacity', '0.5')

    // Detect initial expanded state and notify main process
    const widgetPanel = document.querySelector('[class*="dashboard__Widgets"]')
    const expanded = widgetPanel && parseFloat(getComputedStyle(widgetPanel).width) > 0
    ipcRenderer.send('update-ui-state', { widgetPanelExpanded: expanded })

    return true
  } catch (error) {
    utils.logError('Error handling widget panel:', error)
    return false
  }
}

module.exports = {
  handleLiveView,
  initializeDashboardPage,
  handleWidgetPanel,
}
