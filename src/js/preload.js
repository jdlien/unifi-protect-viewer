const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')

// Track login attempts to prevent infinite loops
let loginAttempts = 0
const MAX_LOGIN_ATTEMPTS = 3

// Login detector - check if this is a login page
function isLoginPage() {
  console.log('Checking if this is a login page:', window.location.href)

  // Check URL patterns
  const url = window.location.href.toLowerCase()
  if (url.includes('login') || url.includes('signin') || url.includes('auth') || url.includes('/ui/login')) {
    return true
  }

  // Check for login form elements
  const usernameField =
    document.querySelector('input[name="username"]') || document.querySelector('input[type="email"]')
  const passwordField = document.querySelector('input[type="password"]')
  const loginButton =
    document.querySelector('button[type="submit"]') ||
    Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent.toLowerCase().includes('login'))

  return !!(usernameField && passwordField && loginButton)
}

// Login handler - attempt to fill in credentials and submit
async function attemptLogin() {
  console.log(`Login attempt ${loginAttempts + 1}/${MAX_LOGIN_ATTEMPTS}`)

  // Increment attempt counter and check max attempts
  loginAttempts++
  if (loginAttempts > MAX_LOGIN_ATTEMPTS) {
    console.log('Maximum login attempts reached, stopping auto-login')
    return false
  }

  try {
    // Load credentials
    const config = await ipcRenderer.invoke('configLoad')
    if (!config?.username || !config?.password) {
      console.log('No credentials found in config')
      return false
    }

    // Find form elements
    console.log('Searching for login form elements')
    const usernameField =
      document.querySelector('input[name="username"]') ||
      document.querySelector('input[type="email"]') ||
      document.querySelector('input[type="text"][id*="user"]')

    const passwordField = document.querySelector('input[type="password"]')

    const submitButton =
      document.querySelector('button[type="submit"]') ||
      Array.from(document.querySelectorAll('button')).find(
        (btn) => btn.textContent.toLowerCase().includes('login') || btn.textContent.toLowerCase().includes('sign in'),
      )

    if (!usernameField || !passwordField || !submitButton) {
      console.log('Could not find all login form elements:', {
        username: !!usernameField,
        password: !!passwordField,
        button: !!submitButton,
      })
      return false
    }

    console.log('Found all login form elements, filling credentials')

    // Fill in credentials
    usernameField.value = config.username
    usernameField.dispatchEvent(new Event('input', { bubbles: true }))
    usernameField.dispatchEvent(new Event('change', { bubbles: true }))

    passwordField.value = config.password
    passwordField.dispatchEvent(new Event('input', { bubbles: true }))
    passwordField.dispatchEvent(new Event('change', { bubbles: true }))

    // Submit form
    console.log('Clicking login button')
    submitButton.click()

    return true
  } catch (error) {
    console.error('Auto-login failed:', error)
    return false
  }
}

// Run initialization to setup automatic fullscreen and navigation
window.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, URL:', window.location.href)

  // Give the page a moment to fully render, then check for login or run setup
  setTimeout(async () => {
    if (isLoginPage()) {
      console.log('Login page detected, attempting auto-login')
      attemptLogin()
    } else {
      console.log('Setting up navigation monitoring and UI customizations')
      setupNavigationMonitor()

      try {
        // Wait for the page to be fully loaded
        await waitForLiveViewReady()

        // Apply UI customizations if we're on the dashboard
        if (checkUrl('/protect/dashboard')) {
          handleLiveviewV4andV5()
        }
      } catch (error) {
        console.error('Error setting up UI customizations:', error)
      }
    }
  }, 1000)
})

// Set up key event handlers
window.addEventListener('keydown', (event) => {
  // F10 for reset
  if (event.key === 'F10') {
    if (event.shiftKey) {
      // Force reset with Shift+F10
      ipcRenderer.send('reset')
      ipcRenderer.send('restart')
    } else {
      // Show confirmation dialog
      ipcRenderer.invoke('showResetConfirmation').then((confirmed) => {
        if (confirmed) {
          ipcRenderer.send('reset')
          ipcRenderer.send('restart')
        }
      })
    }
  }

  // F9 for restart
  if (event.key === 'F9') {
    ipcRenderer.send('restart')
  }

  // Escape to toggle UI elements
  if (event.key === 'Escape') {
    toggleNavigation()
  }
})

// Toggle navigation UI elements
function toggleNavigation() {
  const header = document.querySelector('header')
  const nav = document.querySelector('nav')

  if (header && nav) {
    const isHidden = header.style.display === 'none'
    header.style.display = isHidden ? 'flex' : 'none'
    nav.style.display = isHidden ? 'flex' : 'none'

    // Save the navigation visibility preference to config
    ipcRenderer.invoke('configLoad').then((config) => {
      config = config || {}
      // The setting is "hideNavigation", so we store the opposite of isHidden
      config.hideNavigation = !isHidden
      ipcRenderer.send('configSave', config)
      // console.log('Navigation preference saved:', config.hideNavigation ? 'Hidden' : 'Visible')
    })
  }

  // Add call to handle dashboard button visibility when toggling navigation
  handleDashboardButton()
}

// Fullscreen view modification function
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

  // Get config and check user's navigation visibility preference
  const config = (await ipcRenderer.invoke('configLoad')) || {}
  // Default to hiding navigation if setting doesn't exist
  const hideNavigation = config.hideNavigation !== false

  // Apply navigation visibility based on user preference
  setStyle(document.getElementsByTagName('header')[0], 'display', hideNavigation ? 'none' : 'flex')
  setStyle(document.getElementsByTagName('nav')[0], 'display', hideNavigation ? 'none' : 'flex')

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

  // Show dashboard button after UI modifications
  handleDashboardButton()
}

// Helper for dashboard button navigation
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

// Dashboard button overlay function
function injectDashboardButton() {
  if (document.getElementById('dashboard-button')) return

  const button = document.createElement('button')
  button.id = 'dashboard-button'

  // Read the SVG file
  const svgPath = path.join(__dirname, '../img/dashboard-button.svg')
  let dashboardSvg

  try {
    dashboardSvg = fs.readFileSync(svgPath, 'utf8')
  } catch (error) {
    console.error('Error reading dashboard SVG:', error)
    // Fallback to a simple text button if SVG can't be loaded
    dashboardSvg = '<div>Dashboard</div>'
  }

  const buttonContent = `
  <div style="display: flex;align-items: center;">
    <div style="margin-right:4px; font-size:18px;">←</div>
    ${dashboardSvg}
  </div>`

  button.innerHTML = buttonContent
  button.onclick = triggerDashboardNavigation

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

// Function to handle dashboard button visibility
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

// Setup navigation monitoring to detect URL changes in SPA
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
    handleLiveviewV4andV5()
  }, 1500)

  // Cleanup function
  return () => {
    observer.disconnect()
    navigationEvents.forEach((event) => {
      window.removeEventListener(event, () => {})
    })
  }
}

// Helper functions
async function waitUntil(condition, timeout = 60000, interval = 100) {
  return new Promise((resolve) => {
    function complete(result) {
      timeoutId ? clearTimeout(timeoutId) : {}
      intervalId ? clearInterval(intervalId) : {}

      setTimeout(() => {
        resolve(result)
      }, 20)
    }

    const timeoutId =
      timeout !== -1
        ? setTimeout(() => {
            complete(false)
          }, timeout)
        : undefined

    const intervalId = setInterval(() => {
      if (condition()) {
        complete(true)
      }
    }, interval)
  })
}

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

async function wait(amount) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, amount)
  })
}

function setStyle(element, style, value) {
  if (!element) return
  element.style[style] = value
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

function elementExists(elements, index = 0) {
  return elements.length > 0 && elements[index]
}

function hasElements(elements) {
  return elements.length > 0
}

function checkUrl(urlPart) {
  return document.URL.includes(urlPart)
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  configLoad: () => ipcRenderer.invoke('configLoad'),
  configSave: (config) => ipcRenderer.send('configSave', config),

  // App management
  reset: () => ipcRenderer.send('reset'),
  restart: () => ipcRenderer.send('restart'),
  showResetConfirmation: () => ipcRenderer.invoke('showResetConfirmation'),

  // Navigation
  loadURL: (url) => ipcRenderer.send('loadURL', url),

  // UI functions
  toggleNavigation: toggleNavigation,

  // Aliases for backward compatibility
  loadConfig: () => ipcRenderer.invoke('configLoad'),
  saveConfig: (config) => ipcRenderer.send('configSave', config),
  resetApp: () => ipcRenderer.send('reset'),
  restartApp: () => ipcRenderer.send('restart'),
  confirmReset: () => ipcRenderer.invoke('showResetConfirmation'),
})
