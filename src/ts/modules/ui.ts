import { waitUntil, setStyle, clickElement, logError } from './utils'
import { DOM_ELEMENT_WAIT_MS, WIDGET_TRANSITION_MS } from './constants'

const { ipcRenderer } = require('electron') as typeof import('electron')

/**
 * Fullscreen view modification function to customize the LiveView UI.
 * Only compatible with UniFi Protect 5.0 and later.
 */
export async function handleLiveView(): Promise<void> {
  await waitUntil(() => document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0)

  if (document.getElementsByClassName('ReactModalPortal').length > 0) {
    Array.from(document.getElementsByClassName('ReactModalPortal')).forEach((modalPortal) => {
      if (modalPortal.getElementsByTagName('svg').length > 0 && modalPortal.getElementsByTagName('svg')[0]) {
        clickElement(modalPortal.getElementsByTagName('svg')[0] as unknown as HTMLElement)
      }
    })
  }

  await waitUntil(
    () =>
      Array.from(document.getElementsByClassName('ReactModalPortal'))
        .map((e) => e.children.length === 0)
        .filter((e) => e === false).length === 0,
  )

  setStyle(document.getElementsByTagName('body')[0], 'background', 'black')

  // Apply navigation visibility via the centralized controller
  const uiController = require('./uiController') as typeof import('./uiController')
  uiController.enforceCurrentState()

  setStyle(document.querySelectorAll('[class^=dashboard__Content]')[0] as HTMLElement, 'gap', '0')
  setStyle(document.querySelectorAll('[class^=dashboard__Content]')[0] as HTMLElement, 'padding', '0')
  setStyle(
    document.querySelectorAll('[class^=liveView__FullscreenWrapper]')[0] as HTMLElement,
    'background-color',
    'black',
  )
  setStyle(
    (document.querySelectorAll('[class^=liveView__LiveViewWrapper]')[0] as HTMLElement)?.querySelectorAll(
      '[class^=common__Widget]',
    )[0] as HTMLElement,
    'border',
    '0',
  )
  setStyle(
    (document.querySelectorAll('[class^=liveView__LiveViewWrapper]')[0] as HTMLElement)?.querySelectorAll(
      '[class^=dashboard__Scrollable]',
    )[0] as HTMLElement,
    'paddingBottom',
    '0',
  )

  if (!document.URL.includes('/protect/dashboard/all')) {
    let viewPortAspectRatio = 16 / 9

    const viewPortsWrapper = document.querySelectorAll('[class^=liveview__ViewportsWrapper]')[0] as HTMLElement
    if (viewPortsWrapper) {
      viewPortAspectRatio = viewPortsWrapper.offsetWidth / viewPortsWrapper.offsetHeight
    }

    setStyle(
      (document.querySelectorAll('[class^=liveView__LiveViewWrapper]')[0] as HTMLElement)?.querySelectorAll(
        '[class^=liveview__ViewportsWrapper]',
      )[0] as HTMLElement,
      'maxWidth',
      `calc(100vh * ${viewPortAspectRatio})`,
    )
  }

  await waitUntil(() => document.querySelectorAll('[data-testid="option"]').length > 0)

  await handleWidgetPanel()
}

/**
 * Initialize dashboard page with UI customizations
 */
export function initializeDashboardPage(): boolean {
  const dashboard = require('./dashboard') as typeof import('./dashboard')

  try {
    dashboard.initializeDashboard()
    return true
  } catch (error) {
    logError('Error delegating to dashboard module:', error)
    return false
  }
}

/**
 * Adjust the widget panel button appearance
 */
export async function handleWidgetPanel(): Promise<boolean> {
  try {
    await waitUntil(() => {
      return (
        document.querySelector('[class*="dashboard__Widgets"]') !== null &&
        document.querySelector('[class*="dashboard__StyledExpandButton"] button') !== null
      )
    }, DOM_ELEMENT_WAIT_MS)

    const expandButton = document.querySelector('[class*="dashboard__StyledExpandButton"] button') as HTMLElement
    setStyle(expandButton, 'opacity', '0.5')

    const widgetPanel = document.querySelector('[class*="dashboard__Widgets"]') as HTMLElement
    const expanded = widgetPanel && parseFloat(getComputedStyle(widgetPanel).width) > 0
    ipcRenderer.send('update-ui-state', { widgetPanelExpanded: expanded })

    return true
  } catch (error) {
    logError('Error handling widget panel:', error)
    return false
  }
}

/**
 * Toggle the widget panel expand/collapse state.
 * Clicks the expand button, waits for the CSS transition, then notifies main process.
 */
export function toggleWidgetPanel(): void {
  const expandButton = document.querySelector('[class*="dashboard__StyledExpandButton"] button') as HTMLElement | null
  if (expandButton) {
    expandButton.click()
    setTimeout(() => {
      const widgetPanel = document.querySelector('[class*="dashboard__Widgets"]') as HTMLElement
      const expanded = widgetPanel && parseFloat(getComputedStyle(widgetPanel).width) > 0
      ipcRenderer.send('update-ui-state', { widgetPanelExpanded: expanded })
    }, WIDGET_TRANSITION_MS)
  } else {
    logError('Could not find widget panel expand button')
  }
}
