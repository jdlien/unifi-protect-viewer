const { contextBridge, ipcRenderer } = require('electron')

const FALLBACK_URL = 'config.html' // Fallback URL for safety

// Global state to track navigation attempts
let isNavigating = false
let navigationTimer = null

// event listeners
// Enhanced event listeners
addEventListener(
  'load',
  () => {
    run().catch(async (error) => {
      console.error('Run failed:', error)
      // If run fails, redirect to config page
      window.location.href = FALLBACK_URL
    })
  },
  { once: true }
)

addEventListener('keydown', async (event) => {
  if (event.key === 'F9') {
    ipcRenderer.send('restart')
  }

  if (event.key === 'F10') {
    if (event.shiftKey) {
      // Force reset with Shift + F10 (bypasses confirmation)
      await forceReset()
    } else {
      // Normal reset with F10
      try {
        const confirmed = await showResetConfirmation()
        if (confirmed) {
          await forceReset()
        }
      } catch (error) {
        console.error('Reset confirmation failed, forcing reset:', error)
        await forceReset()
      }
    }
    return
  }

  // Command/Control + N to toggle navigation and header
  if (((event.ctrlKey || event.metaKey) && event.key === 'n') || event.key === 'Escape') {
    toggleNavigation()
  }
})

// Toggle the visisbility of the navigation and header elements
function toggleNavigation() {
  // Toggle between hiding and showing the menu
  const header = document.getElementsByTagName('header')[0]
  const nav = document.getElementsByTagName('nav')[0]

  if (header && nav) {
    const isHidden = header.style.display === 'none'
    header.style.display = isHidden ? 'flex' : 'none'
    nav.style.display = isHidden ? 'flex' : 'none'
  }

  handleDashboardButton()
}

// electron events
const reset = () => ipcRenderer.send('reset')
const restart = () => ipcRenderer.send('restart')
const configSave = (config) => ipcRenderer.send('configSave', config)

const configLoad = () => ipcRenderer.invoke('configLoad')

const showResetConfirmation = () => ipcRenderer.invoke('showResetConfirmation')

// Safety reset function that doesn't depend on UI state
const forceReset = async () => {
  ipcRenderer.send('reset')
  ipcRenderer.send('restart')
}

contextBridge.exposeInMainWorld('electronAPI', {
  reset: () => reset(),
  restart: () => restart(),
  configSave: (config) => configSave(config),
  configLoad: () => configLoad(),
  showResetConfirmation: () => showResetConfirmation(),
  getURL: async () => {
    const config = await configLoad()
    return config?.url || 'No URL found'
  },
})

// handle fnc
async function handleLogin() {
  // wait until login button is present
  await waitUntil(() => document.getElementsByTagName('button').length > 0)

  const config = await configLoad()

  setNativeValue(document.getElementsByName('username')[0], config.username)
  setNativeValue(document.getElementsByName('password')[0], config.password)

  // Attempting to check "remember me" so it doesn't ask for login every time
  const rememberMeCheckbox = document.getElementById('rememberMe')
  if (rememberMeCheckbox && !rememberMeCheckbox.checked) {
    clickElement(rememberMeCheckbox)
  }

  clickElement(document.getElementsByTagName('button')[0])
}

async function handleLiveviewV4andV5() {
  // wait until liveview is present
  await waitUntil(() => document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0)

  // close all modals if needed
  if (hasElements(document.getElementsByClassName('ReactModalPortal'))) {
    Array.from(document.getElementsByClassName('ReactModalPortal')).forEach((modalPortal) => {
      if (elementExists(modalPortal.getElementsByTagName('svg'), 0)) {
        clickElement(modalPortal.getElementsByTagName('svg')[0])
      }
    })
  }

  // wait until modals are closed
  await waitUntil(
    () =>
      Array.from(document.getElementsByClassName('ReactModalPortal'))
        .map((e) => e.children.length === 0)
        .filter((e) => e === false).length === 0
  )

  setStyle(document.getElementsByTagName('body')[0], 'background', 'black')
  setStyle(document.getElementsByTagName('header')[0], 'display', 'none')
  setStyle(document.getElementsByTagName('nav')[0], 'display', 'none')

  setStyle(document.querySelectorAll('[class^=dashboard__Content]')[0], 'gap', '0')
  setStyle(document.querySelectorAll('[class^=dashboard__Content]')[0], 'padding', '0')
  setStyle(document.querySelectorAll('[class^=liveView__FullscreenWrapper]')[0], 'background-color', 'black')
  setStyle(
    document.querySelectorAll('[class^=liveView__LiveViewWrapper]')[0].querySelectorAll('[class^=common__Widget]')[0],
    'border',
    '0'
  )
  setStyle(
    document
      .querySelectorAll('[class^=liveView__LiveViewWrapper]')[0]
      .querySelectorAll('[class^=dashboard__Scrollable]')[0],
    'paddingBottom',
    '0'
  )

  // For grids other than "All Cameras", we adjust the aspect ratio of the ViewPortsWrapper to match so that
  // they all fit within the window without cropping or needing to scroll
  // The "All Cameras" view is designed to be scrolled, so we don't adjust it
  if (!checkUrl('/protect/dashboard/all')) {
    // Get the aspect ratio of the ViewPortsWrapper
    let viewPortAspectRatio = 16 / 9

    const viewPortsWrapper = document.querySelectorAll('[class^=liveview__ViewportsWrapper]')[0]
    if (viewPortsWrapper) {
      viewPortAspectRatio = viewPortsWrapper.offsetWidth / viewPortsWrapper.offsetHeight
    }

    // Set the max width of the ViewPortsWrapper to maintain the aspect ratio
    setStyle(
      document
        .querySelectorAll('[class^=liveView__LiveViewWrapper]')[0]
        .querySelectorAll('[class^=liveview__ViewportsWrapper]')[0],
      'maxWidth',
      `calc(100vh * ${viewPortAspectRatio})`
    )
  }

  // wait until remove option buttons are visible
  await waitUntil(() => document.querySelectorAll('[data-testid="option"]').length > 0)

  // Check if the widget panel is open
  let isWidgetPanelOpen = document.querySelector('[class^=dashboard__Widgets]').offsetWidth > 0

  // If the widget panel is open, close it
  if (isWidgetPanelOpen) {
    document.querySelectorAll('button[class^=dashboard__ExpandButton]')[0].click()
  }

  // Make the widget panel open/close button less prominent
  setStyle(document.querySelectorAll('button[class^=dashboard__ExpandButton]')[0], 'opacity', '0.5')
}

const triggerDashboardNavigation = () => {
  // Find the UniFi dashboard link
  const dashboardLink = document.querySelector('a[href*="/protect/dashboard"]')

  if (dashboardLink) {
    // Trigger a click event
    dashboardLink.click()
  }
}

function injectDashboardButton() {
  if (document.getElementById('dashboard-button')) return

  const button = document.createElement('button')
  button.id = 'dashboard-button'
  button.innerText = '← Dashboard'
  button.style.position = 'fixed'
  button.style.top = '48px'
  button.style.left = '24px'
  button.style.zIndex = '1000'
  // button.style.display = 'none'
  button.style.padding = '2px 8px'
  button.style.border = 'none'
  button.style.borderRadius = '4px'
  button.style.fontWeight = 'bold'
  button.style.cursor = 'pointer'
  button.style.fontSize = '14px'
  button.style.lineHeight = '1.6'
  // Get the URL up to the '/protect/' part
  const protectIndex = document.URL.indexOf('/protect/')
  const baseUrl = document.URL.substring(0, protectIndex + '/protect/'.length)
  const dashboardUrl = baseUrl + 'dashboard'

  button.onclick = () => {
    triggerDashboardNavigation()
  }

  const buttonContent = `
  <div style="display: flex;align-items: center;">
    <div style="margin-right:4px; font-size:18px;">←</div>
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      width="24px"
      height="24px"
      class=""
      stroke="currentColor"
      stroke-width="0"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="currentColor"
        class="twoTone__1pNlrTNT"
      ></circle>
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2Zm0 19c-4.96 0-9-4.04-9-9s4.04-9 9-9 9 4.04 9 9-4.04 9-9 9Zm5.66-10.5c-.21 0-.4-.13-.47-.33A5.51 5.51 0 0 0 12 6.5a5.51 5.51 0 0 0-5.19 3.67c-.09.26-.38.4-.64.3a.493.493 0 0 1-.3-.64A6.515 6.515 0 0 1 12 5.5c2.75 0 5.21 1.74 6.13 4.33a.501.501 0 0 1-.47.67Zm-7.04 1.84c.41-.22.89-.34 1.38-.34 1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3c0-.79.32-1.53.82-2.06l-1.69-2.17a.497.497 0 0 1 .09-.7c.21-.17.53-.13.7.09l1.7 2.18ZM10 15c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2c-.44 0-.86.14-1.19.39-.49.37-.81.95-.81 1.61Z"
        fill="currentColor"
      ></path>
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM6.812 10.167a5.503 5.503 0 0 1 10.375 0 .5.5 0 1 0 .942-.334 6.503 6.503 0 0 0-12.26 0 .5.5 0 1 0 .943.334ZM10 15a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm-1 0a3 3 0 1 0 1.294-2.468l-1.337-2.315a.5.5 0 1 0-.866.5l1.467 2.54A2.986 2.986 0 0 0 9 15Z"
        fill="currentColor"
        class="hidden__1pNlrTNT"
      ></path>
    </svg>
  </div>`

  button.innerHTML = buttonContent

  document.body.appendChild(button)

  // Create and inject the stylesheet
  const style = document.createElement('style')
  style.innerHTML = `
    #dashboard-button {
      color: rgb(183, 188, 194);
      background-color: rgba(0, 0, 0, 0.6);
    }

    #dashboard-button:hover {
      background-color: rgba(0, 0, 0, 0.7);
      color: rgb(153, 160, 168);
    }
  `

  document.body.appendChild(style)
}

// Ensure that the dashboard button is visible when on a Protect page that isn't the dashboard
function handleDashboardButton() {
  injectDashboardButton()

  // Check if we're already on dashboard
  if (checkUrl('/protect/dashboard')) {
    setDashboardButtonVisibility(false)
    return
  }

  // Check if the nav is visible. If not, show the dashboard button
  const nav = document.getElementsByTagName('nav')[0]
  if (!nav || nav.style.display === 'none') {
    setDashboardButtonVisibility(true)
    return
  } else {
    setDashboardButtonVisibility(false)
  }
}

function setDashboardButtonVisibility(show) {
  const button = document.getElementById('dashboard-button')
  if (!button) return

  if (show) button.style.display = 'block'
  else button.style.display = 'none'
}

// Handle detecting navigation
// Monitor URL changes using MutationObserver for SPA navigation
function setupNavigationMonitor() {
  // Track the last known URL to prevent duplicate handling
  let lastUrl = window.location.href

  // Single MutationObserver to watch for DOM changes that might indicate navigation
  const observer = new MutationObserver((mutations) => {
    // Only proceed if the URL has changed
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      handleDashboardButton()
      handleLiveviewV4andV5()
    }
  })

  // Configure the observer with more specific targets
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false, // Don't watch for attribute changes
    characterData: false, // Don't watch for text content changes
  })

  // Single event listener for all navigation-related events
  const navigationEvents = ['popstate', 'hashchange']
  navigationEvents.forEach((event) => {
    window.addEventListener(event, () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        handleDashboardButton()
        handleLiveviewV4andV5()
      }
    })
  })

  // Initial call, add a small delay to ensure the page has loaded

  setTimeout(() => {
    handleDashboardButton()
  }, 1500)

  // Cleanup function
  return () => {
    observer.disconnect()
    navigationEvents.forEach((event) => {
      window.removeEventListener(event, debouncedHandler)
    })
  }
}

// logic
async function run() {
  const config = await configLoad()

  // config/ start page
  if (checkUrl('index.html') || checkUrl('config.html')) return

  if (!checkUrl(config.url)) {
    window.location.href = config.url
  }

  // Watch for navigation changes
  setupNavigationMonitor()

  // wait until unifi loading screen visible, timeout 3000
  await waitUntil(() => document.querySelectorAll('[data-testid="loader-screen"]').length > 0, 1000)

  // wait until unifi loading screen is gone
  await waitUntil(() => document.querySelectorAll('[data-testid="loader-screen"]').length === 0)

  // unifi stuff - login
  if (checkUrl('login')) {
    await handleLogin()

    await waitUntil(() => !checkUrl('login'))
  }

  // wait until unifi version is visible (for v4), timeout 10000
  await waitUntil(() => document.querySelectorAll('[class^=Version__Item] > span').length > 0, 10000)

  // get version from screen (v4 has version string, v3 has not)
  const version =
    Array.from(document.querySelectorAll('[class^=Version__Item] > span'))
      .filter((el) => el.innerText.includes('Protect'))
      .at(0)?.innerHTML ?? 'Protect 3.x'

  // unifi stuff - fullscreen for dashboard (version 4)
  if (checkUrl('protect/dashboard') && (version.includes('4.') || version.includes('5.'))) {
    await waitForLiveViewReady()
    await handleLiveviewV4andV5()
    // Ensure that we can detect page changes so we can show the dashboard button if needed
  }

  // reload & login when token expires (v3 & v4) and we got the expires at in localstorage
  if (localStorage.getItem('portal:localSessionsExpiresAt')) {
    const loginExpiresAt = +localStorage.getItem('portal:localSessionsExpiresAt')

    // offset 10 minutes before expire
    const offset = 10 * 60 * 1000

    // wait until ~10 minutes before expire or page url changed
    await waitUntil(() => !checkUrl(config.url) || new Date().getTime() > loginExpiresAt - offset, -1, 60000)

    location.reload()
  }
}

// General purpose functions

async function wait(amount) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, amount)
  })
}

async function waitUntil(condition, timeout = 60000, interval = 100) {
  return new Promise((resolve) => {
    function complete(result) {
      timeoutAd ? clearTimeout(timeoutAd) : {}
      intervalAd ? clearInterval(intervalAd) : {}

      setTimeout(() => {
        resolve(result)
      }, 20)
    }

    const timeoutAd =
      timeout !== -1
        ? setTimeout(() => {
            complete(false)
          }, timeout)
        : undefined

    const intervalAd = setInterval(() => {
      if (condition()) {
        complete(true)
      }
    }, interval)
  })
}

// Ensures that the live view is fully loaded and ready to be manipulated
async function waitForLiveViewReady() {
  // Wait for the loader screen to disappear
  await waitUntil(() => document.querySelectorAll('[data-testid="loader-screen"]').length === 0)

  // Wait for the skeleton view to disappear
  await waitUntil(() => {
    const skeletonViews = document.querySelectorAll('[class*="Pages__LoadingOverlay"]')
    return skeletonViews.length === 0
  })

  // Wait for key elements to be present
  await waitUntil(
    () =>
      document.querySelectorAll('[class^=liveView__FullscreenWrapper]').length > 0 &&
      document.querySelectorAll('[class^=dashboard__Content]').length > 0 &&
      document.querySelectorAll('[data-testid="option"]').length > 0
  )

  // Additional check: wait for any loading indicators to disappear
  await waitUntil(() => {
    const loadingElements = document.querySelectorAll('[class*="loading"], [class*="Loading"]')
    return loadingElements.length === 0
  })

  // Wait a short moment to ensure any final rendering is complete
  await wait(500)

  return true
}

function setNativeValue(element, value) {
  if (!element) return

  const lastValue = element.value
  element.value = value
  const event = new Event('input', { target: element, bubbles: true })

  event.simulated = true

  // React 16
  const tracker = element._valueTracker
  if (tracker) {
    tracker.setValue(lastValue)
  }
  element.dispatchEvent(event)
}

function clickElement(element) {
  if (!element) return

  if (element.click) {
    element.click()
  } else {
    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    })

    element.dispatchEvent(event)
  }
}

function setStyle(element, style, value) {
  if (!element) return

  element.style[style] = value
}

function elementExists(elements, index = 0) {
  return elements.length > 0 && elements[index]
}

function hasElements(elements) {
  return elements.length > 0
}

function checkUrl(urlPart) {
  return document.URL.includes(urlPart)
}
