const { contextBridge, ipcRenderer } = require('electron')

const FALLBACK_URL = 'config.html' // Fallback URL for safety

// Global state to track navigation attempts
let isNavigating = false
let navigationTimer = null
// Add debugging for navigation
let navigationHistory = []
let lastUrl = ''
// Track redirects without overriding location
let redirectAttempts = 0
const MAX_REDIRECTS = 3

// Safely track navigation without overriding location
function trackNavigation(url, type = 'tracked') {
  redirectAttempts++
  console.warn(`Navigation #${redirectAttempts} (${type}): ${url}`)
  navigationHistory.push({
    type: type,
    url: url,
    time: new Date().toISOString(),
  })

  // Update debug UI if it exists
  setTimeout(() => {
    try {
      const debugElement = document.getElementById('upv-debug-info')
      if (debugElement) {
        const historyHTML = navigationHistory
          .map((entry) => `<div>${entry.time.substr(11, 8)} - [${entry.type}] - ${entry.url}</div>`)
          .join('')

        debugElement.innerHTML = `
          <div>URL: ${window.location.href}</div>
          <div>Redirect attempts: ${redirectAttempts}</div>
          <div style="margin-top: 10px;">
            <strong>Navigation History:</strong>
            ${historyHTML}
          </div>
        `
      }
    } catch (err) {
      console.error('Failed to update debug element:', err)
    }
  }, 100)

  return redirectAttempts <= MAX_REDIRECTS
}

// Safer navigation function that respects redirect limits
function safeNavigate(url) {
  if (trackNavigation(url, 'redirect')) {
    console.log(`Navigating to: ${url}`)
    window.location.href = url
    return true
  } else {
    console.error(`BLOCKED REDIRECT to: ${url} - too many redirects`)

    // Add a visible notification
    setTimeout(() => {
      try {
        const blockNotice = document.createElement('div')
        blockNotice.style.position = 'fixed'
        blockNotice.style.top = '0'
        blockNotice.style.left = '0'
        blockNotice.style.right = '0'
        blockNotice.style.padding = '10px'
        blockNotice.style.backgroundColor = '#ff0000'
        blockNotice.style.color = '#ffffff'
        blockNotice.style.textAlign = 'center'
        blockNotice.style.fontWeight = 'bold'
        blockNotice.style.zIndex = '10000'
        blockNotice.innerText = `Redirect loop detected and blocked (${redirectAttempts} attempts)`
        document.body.appendChild(blockNotice)
      } catch (err) {
        console.error('Failed to add redirect notice:', err)
      }
    }, 500)

    return false
  }
}

// event listeners
// Enhanced event listeners
addEventListener(
  'load',
  () => {
    console.log('*** PAGE LOAD EVENT FIRED ***')
    console.log('Current URL:', window.location.href)
    trackNavigation(window.location.href, 'page-load')

    // Check if run() function exists
    if (typeof run !== 'function') {
      console.error('run() function is not defined')

      // Only redirect if we haven't exceeded redirect limit
      if (redirectAttempts < MAX_REDIRECTS) {
        console.log('Redirecting to config page (run not defined)')
        safeNavigate(FALLBACK_URL)
      } else {
        console.error('Too many redirects, staying on current page')
      }
      return
    }

    run().catch(async (error) => {
      console.error('Run failed:', error)

      // Only redirect if we haven't exceeded redirect limit
      if (redirectAttempts < MAX_REDIRECTS) {
        console.log('Redirecting to config page (run error)')
        safeNavigate(FALLBACK_URL)
      } else {
        console.error('Too many redirects, staying on current page despite run() error')
      }
    })
  },
  { once: true },
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

  // Escape to toggle navigation and header
  if (event.key === 'Escape') {
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

console.log('Exposing API functions to renderer')
contextBridge.exposeInMainWorld('electronAPI', {
  reset: () => reset(),
  restart: () => restart(),
  configSave: (config) => configSave(config),
  configLoad: () => configLoad(),
  showResetConfirmation: () => showResetConfirmation(),
  getURL: async () => {
    try {
      const config = await configLoad()
      return config?.url || 'No URL found'
    } catch (error) {
      console.error('Error in getURL:', error)
      return 'Error loading URL'
    }
  },
})

// handle fnc
async function handleLogin() {
  console.log('Attempting login')

  try {
    // wait until login button is present with timeout
    console.log('Waiting for login form elements...')
    const loginFormFound = await waitUntil(() => document.getElementsByTagName('button').length > 0, 10000)

    if (!loginFormFound) {
      console.error('Login form not found (timeout)')
      return false
    }

    // Take screenshot of login form to debug element for inspection
    try {
      const loginForm = document.querySelector('form') || document.body
      const debugElement = document.getElementById('upv-debug-info')
      if (debugElement) {
        debugElement.innerHTML += `
          <div style="margin-top: 10px; border-top: 1px solid #555; padding-top: 5px;">
            <strong>Login form detected:</strong>
            <div>Buttons: ${document.getElementsByTagName('button').length}</div>
            <div>Username field: ${document.getElementsByName('username').length > 0}</div>
            <div>Password field: ${document.getElementsByName('password').length > 0}</div>
          </div>
        `
      }
    } catch (err) {
      console.error('Failed to get login form info:', err)
    }

    console.log('Login form found, getting credentials')
    const config = await configLoad()

    // Check if username and password fields exist
    const usernameField = document.getElementsByName('username')[0]
    const passwordField = document.getElementsByName('password')[0]
    const loginButton = document.getElementsByTagName('button')[0]

    if (!usernameField || !passwordField || !loginButton) {
      console.error('Login elements not found:', {
        username: !!usernameField,
        password: !!passwordField,
        button: !!loginButton,
      })
      return false
    }

    console.log('Setting credentials')
    setNativeValue(usernameField, config.username)
    setNativeValue(passwordField, config.password)

    // Attempting to check "remember me" so it doesn't ask for login every time
    const rememberMeCheckbox = document.getElementById('rememberMe')
    if (rememberMeCheckbox && !rememberMeCheckbox.checked) {
      clickElement(rememberMeCheckbox)
      console.log('Checked "Remember Me" box')
    }

    console.log('Clicking login button')
    clickElement(loginButton)

    // Wait briefly to see if we navigate away from login page
    await wait(5000)

    // Check if we're still on the login page
    if (checkUrl('login')) {
      console.error('Still on login page after attempt. Login might have failed.')

      // Check for error messages
      const errorElements = document.querySelectorAll('.error, .alert, [class*="error"], [class*="Error"]')
      if (errorElements.length > 0) {
        console.error(
          'Login error messages found:',
          Array.from(errorElements)
            .map((el) => el.textContent)
            .join(', '),
        )
      }

      return false
    }

    console.log('Login successful - navigated away from login page')
    return true
  } catch (error) {
    console.error('Login attempt failed with error:', error)
    return false
  }
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
        .filter((e) => e === false).length === 0,
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
    '0',
  )
  setStyle(
    document
      .querySelectorAll('[class^=liveView__LiveViewWrapper]')[0]
      .querySelectorAll('[class^=dashboard__Scrollable]')[0],
    'paddingBottom',
    '0',
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
      `calc(100vh * ${viewPortAspectRatio})`,
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

function triggerDashboardNavigation() {
  // Get the URL up to the '/protect/' part
  const protectIndex = document.URL.indexOf('/protect/')
  const baseUrl = document.URL.substring(0, protectIndex + '/protect/'.length)
  const dashboardUrl = baseUrl + 'dashboard'

  // Find the UniFi dashboard link
  const dashboardLink = document.querySelector('a[href*="/protect/dashboard"]')

  // If the link is present, click it. Otherwise, navigate directly.
  if (dashboardLink) dashboardLink.click()
  else window.location.href = dashboardUrl
}

function injectDashboardButton() {
  if (document.getElementById('dashboard-button')) return

  const button = document.createElement('button')
  button.id = 'dashboard-button'
  button.innerText = '← Dashboard'

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

  // Create an informational popup to tell people how to show the nav
  const showNavPopup = document.createElement('div')
  showNavPopup.id = 'show-nav-popup'
  showNavPopup.innerHTML = '<kbd>Esc</kbd> Show/Hide Navigation'
  document.body.appendChild(showNavPopup)

  // Create and inject the stylesheet
  const style = document.createElement('style')
  style.innerHTML = `
    #dashboard-button {
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

    #dashboard-button:hover {
      background-color: rgba(0, 0, 0, 0.7);
      color: rgb(153, 160, 168);
    }

    #show-nav-popup {
      align-items: center;
      position: fixed;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 18px;
      color: hsl(210, 10%, 80%);
      background-color: rgba(0, 0, 0, 0.6);
      pointer-events: none;
      animation: fadeOut 4s ease-in forwards;
    }

    @keyframes fadeOut {
      0% { opacity: 1; }
      65% { opacity: 1; }
      100% { opacity: 0; }
    }

    #show-nav-popup kbd {
      color: white;
      display: inline-block;
      margin-right: 2px;
      font-weight: semibold;
      border-radius: 4px;
      border: 1px solid rgb(183, 188, 194);
      padding: 1px 2px;
    }


  `

  document.body.appendChild(style)

  // Remove the popup from DOM after animation
  setTimeout(() => {
    const popup = document.getElementById('show-nav-popup')
    if (popup) {
      popup.remove()
    }
  }, 4000)
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
  lastUrl = window.location.href
  navigationHistory.push({ url: lastUrl, time: new Date().toISOString() })

  // Log initial navigation state
  console.log('Initial URL:', lastUrl)

  // Single MutationObserver to watch for DOM changes that might indicate navigation
  const observer = new MutationObserver((mutations) => {
    // Only proceed if the URL has changed
    if (window.location.href !== lastUrl) {
      console.log(`Navigation detected: ${lastUrl} -> ${window.location.href}`)
      navigationHistory.push({ url: window.location.href, time: new Date().toISOString() })

      // Update UI debug element if it exists
      try {
        const debugElement = document.getElementById('upv-debug-info')
        if (debugElement) {
          const historyHTML = navigationHistory
            .map((entry) => `<div>${entry.time.substr(11, 8)} - ${entry.url}</div>`)
            .join('')

          debugElement.innerHTML += `
            <div style="margin-top: 10px; border-top: 1px solid #555; padding-top: 5px;">
              <strong>Navigation History:</strong>
              ${historyHTML}
            </div>
          `
        }
      } catch (err) {
        console.error('Failed to update debug element:', err)
      }

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
        console.log(`Navigation event ${event}: ${lastUrl} -> ${window.location.href}`)
        navigationHistory.push({ url: window.location.href, time: new Date().toISOString(), event })
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
  console.log('RUN FUNCTION STARTED')

  // Safety check: clear token expiration if needed
  try {
    if (localStorage.getItem('portal:localSessionsExpiresAt')) {
      const expiresAt = +localStorage.getItem('portal:localSessionsExpiresAt')
      const now = Date.now()

      // If token is already expired or will expire in the next minute,
      // remove it to prevent reload loops
      if (expiresAt <= now + 60000) {
        console.log('Found expired token in localStorage - clearing it')
        localStorage.removeItem('portal:localSessionsExpiresAt')
      }
    }
  } catch (err) {
    console.error('Error checking localStorage:', err)
  }

  const config = await configLoad()
  console.log('Config loaded:', config)

  // config/ start page
  if (checkUrl('index.html') || checkUrl('config.html')) {
    console.log('On index.html or config.html page, no redirect needed')
    return
  }

  // CRITICAL CHECK: Don't redirect if already at or very near redirect limit
  if (redirectAttempts >= MAX_REDIRECTS - 1) {
    console.warn('At redirect limit, skipping all navigation in run()')
    return
  }

  if (!checkUrl(config.url)) {
    console.log(`Not on configured URL, would redirect to: ${config.url}`)

    // Use safe navigation
    if (safeNavigate(config.url)) {
      // Important: return here to prevent further code execution after redirect
      return
    }
  }

  // Only continue if we haven't redirected
  console.log('No redirect needed, continuing with normal execution')

  // Add a debugger element to show what's happening
  setTimeout(() => {
    try {
      const debugElement = document.createElement('div')
      debugElement.id = 'upv-debug-info'
      debugElement.style.position = 'fixed'
      debugElement.style.bottom = '10px'
      debugElement.style.right = '10px'
      debugElement.style.backgroundColor = 'rgba(0,0,0,0.7)'
      debugElement.style.color = '#fff'
      debugElement.style.padding = '10px'
      debugElement.style.borderRadius = '5px'
      debugElement.style.zIndex = '10000'
      debugElement.style.fontSize = '12px'
      debugElement.style.fontFamily = 'monospace'
      debugElement.style.maxWidth = '400px'
      debugElement.style.maxHeight = '200px'
      debugElement.style.overflow = 'auto'
      debugElement.innerHTML = `
        <div>URL: ${window.location.href}</div>
        <div>Has Config: ${!!config}</div>
        <div>Config URL: ${config?.url || 'None'}</div>
        <div>Redirect attempts: ${redirectAttempts}</div>
      `
      document.body.appendChild(debugElement)
    } catch (err) {
      console.error('Failed to add debug element:', err)
    }
  }, 5000)

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

  // Check for token expiration in localStorage - FIXED VERSION
  if (localStorage.getItem('portal:localSessionsExpiresAt')) {
    const loginExpiresAt = +localStorage.getItem('portal:localSessionsExpiresAt')
    const currentTime = new Date().getTime()

    console.log('Session expiration info:', {
      expiresAtTime: new Date(loginExpiresAt).toLocaleString(),
      currentTime: new Date(currentTime).toLocaleString(),
      timeUntilExpiry: Math.round((loginExpiresAt - currentTime) / 1000 / 60) + ' minutes',
    })

    // Only set up reload if expiration is far enough in the future
    // (prevents immediate reload loops)
    if (loginExpiresAt > currentTime + 60000) {
      // Must be at least 1 minute in the future
      // offset 10 minutes before expire
      const offset = 10 * 60 * 1000

      // Only wait if expiration is more than 10 minutes away
      if (loginExpiresAt > currentTime + offset + 60000) {
        console.log(
          `Session will expire in ${Math.round((loginExpiresAt - currentTime) / 1000 / 60)} minutes, setting up wait`,
        )

        // wait until ~10 minutes before expire or page url changed
        await waitUntil(() => !checkUrl(config.url) || new Date().getTime() > loginExpiresAt - offset, -1, 60000)

        // Double-check we're still close to expiration before reloading
        if (new Date().getTime() > loginExpiresAt - offset) {
          console.log('Session is expiring soon, reloading page')
          location.reload()
        }
      }
    } else {
      // Token is already expired or about to expire
      console.log('Session token is already expired or about to expire, clearing it')
      localStorage.removeItem('portal:localSessionsExpiresAt')
    }
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
      document.querySelectorAll('[data-testid="option"]').length > 0,
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
