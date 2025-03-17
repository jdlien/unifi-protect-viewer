// Get info used to spoof Chrome browser
// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const chromeConfig = require(path.join(__dirname, '/src/config/chrome-version'))
const fs = require('node:fs')
// Initialize @electron/remote
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// some const
const defaultWidth = 1270
const defaultHeight = 750

// portable use
const portable = false
const portableStoreCwd = path.join(process.resourcesPath, 'store')
const encryptionKey = '****'

// Store initialization
let store

// Process command line args
const resetRequested = process.argv.includes('--reset')
if (resetRequested) {
  console.log('Reset flag detected, will clear configuration')
}

// Initialize store
async function initializeStore() {
  const Store = (await import('electron-store')).default

  // Create portable directory if needed
  if (portable && !fs.existsSync(portableStoreCwd)) {
    fs.mkdirSync(portableStoreCwd)
  }

  // Initialize store with appropriate config
  store = portable
    ? new Store({ name: 'storage', fileExtension: 'db', cwd: portableStoreCwd, encryptionKey: encryptionKey })
    : new Store()

  // Clear configuration if reset was requested
  if (resetRequested) {
    console.log('Clearing configuration as requested')
    store.clear()
  }
}

// cause self-signed certificate
app.commandLine.appendSwitch('ignore-certificate-errors', 'true')

// dev
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reloader')(module)
  } catch (_) {}
}

// event handlers
function handleReset() {
  store.clear()
}

function handleRestart() {
  app.quit()
  app.relaunch()
}

async function handleConfigLoad() {
  return store.get('config')
}

function handleConfigSave(event, config) {
  store.set('config', config)
}

// window handler
async function handleWindow(mainWindow) {
  if (process.env.NODE_ENV === 'development') {
    setTimeout(() => mainWindow.webContents.openDevTools(), 1000)
  }

  // Check if we have a saved configuration
  const needsConfig = !store.has('config') || !store.get('config')?.url
  console.log(`Configuration ${needsConfig ? 'needed' : 'found'}`)

  if (needsConfig) {
    // No config - load direct config page
    console.log('Loading direct config page for initial setup')
    try {
      await mainWindow.loadFile('./src/html/direct-config.html')
      console.log('Direct config page loaded successfully')
      return
    } catch (err) {
      console.error('Failed to load direct config page:', err)
      // Try regular config page
      try {
        await mainWindow.loadFile('./src/html/config.html')
      } catch (configError) {
        console.error('Failed to load regular config page too:', configError)
      }
    }
  } else {
    // We have a config - try to load the URL directly
    const config = store.get('config')
    console.log(`Attempting to load saved URL: ${config.url}`)

    try {
      await mainWindow.loadURL(config.url, {
        userAgent: chromeConfig.userAgent,
      })
      console.log('URL loaded successfully')

      // Inject the login script
      mainWindow.webContents.on('did-finish-load', () => {
        // If it's a login page, inject the login handler
        if (mainWindow.webContents.getURL().includes('login')) {
          console.log('Login page detected, injecting login script')

          // Extract credentials from config - properly escape for JS
          const username = config.username ? config.username.replace(/[\\'"]/g, '\\$&') : ''
          const password = config.password ? config.password.replace(/[\\'"]/g, '\\$&') : ''

          const loginScript = `
            console.log("Auto-login script running...");

            // Define a utility function to wait for elements
            function waitForElement(selector, timeout = 10000) {
              console.log("Waiting for element:", selector);
              return new Promise((resolve) => {
                // Check immediately first
                if (document.querySelector(selector)) {
                  console.log("Element found immediately:", selector);
                  return resolve(document.querySelector(selector));
                }

                // Set up observer to watch for changes
                const observer = new MutationObserver(() => {
                  if (document.querySelector(selector)) {
                    console.log("Element found after DOM change:", selector);
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                  }
                });

                observer.observe(document.body, {
                  childList: true,
                  subtree: true,
                  attributes: true
                });

                // Set timeout
                setTimeout(() => {
                  console.log("Timeout waiting for element:", selector);
                  observer.disconnect();
                  // Last chance check
                  if (document.querySelector(selector)) {
                    console.log("Element found at last chance:", selector);
                    resolve(document.querySelector(selector));
                  } else {
                    resolve(null);
                  }
                }, timeout);
              });
            }

            // Define utility to set values in React inputs
            function setReactInputValue(input, value) {
              // Store the original value
              const originalValue = input.value;

              // Try multiple approaches

              // 1. Direct property assignment
              input.value = value;

              // 2. Using setAttribute
              input.setAttribute('value', value);

              // 3. Using Object.defineProperty to override the property getter/setter
              let lastValue = value;
              Object.defineProperty(input, 'value', {
                get: function() { return lastValue; },
                set: function(newValue) { lastValue = newValue; },
                configurable: true
              });

              // 4. Simulate keyboard events
              // Clear the field
              input.value = '';

              // Trigger events for React to recognize the change
              const events = [
                new Event('input', { bubbles: true }),
                new Event('change', { bubbles: true }),
                new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
                new KeyboardEvent('keyup', { key: 'a', bubbles: true }),
                new KeyboardEvent('keypress', { key: 'a', bubbles: true })
              ];

              // Dispatch all events
              events.forEach(event => {
                input.dispatchEvent(event);
              });

              // Set the value again
              input.value = value;

              // Dispatch more events after value set
              events.forEach(event => {
                input.dispatchEvent(event);
              });

              console.log(\`Set input value: \${input.id || input.name}, value before: "\${originalValue}", value now: "\${input.value}"\`);
            }

            // Self-executing async function to handle the login process
            (async function() {
              // Add a short delay to ensure page is fully loaded
              await new Promise(resolve => setTimeout(resolve, 1000));
              console.log("Starting login automation...");

              // Wait for and get the form fields
              console.log("Looking for username field #login-username");
              const usernameField = await waitForElement('#login-username');
              console.log("Looking for password field #login-password");
              const passwordField = await waitForElement('#login-password');
              console.log("Looking for submit button (button[type=submit])");
              const submitButton = await waitForElement('button[type="submit"]');

              // Debug what we found
              console.log("Form elements found:", {
                username: !!usernameField,
                password: !!passwordField,
                submit: !!submitButton
              });

              if (usernameField && passwordField && submitButton) {
                console.log("All form elements found, proceeding with fill");

                // Focus and fill username with delay
                usernameField.focus();
                await new Promise(resolve => setTimeout(resolve, 300));
                setReactInputValue(usernameField, "${username}");
                await new Promise(resolve => setTimeout(resolve, 300));

                // Focus and fill password with delay
                passwordField.focus();
                await new Promise(resolve => setTimeout(resolve, 300));
                setReactInputValue(passwordField, "${password}");
                await new Promise(resolve => setTimeout(resolve, 300));

                // Check "Remember Me" checkbox if it exists
                const rememberMe = document.querySelector('#rememberMe');
                if (rememberMe) {
                  console.log("Found 'Remember Me' checkbox");

                  // Set both property and attribute
                  rememberMe.checked = true;
                  rememberMe.setAttribute('aria-checked', 'true');

                  // Dispatch events
                  rememberMe.dispatchEvent(new Event('change', { bubbles: true }));
                  rememberMe.dispatchEvent(new MouseEvent('click', { bubbles: true }));

                  // Try to click the parent container too (for label click)
                  const container = rememberMe.closest('.inputBox__W10ClD5x');
                  if (container) {
                    console.log("Found checkbox container, clicking it");
                    container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                  }
                } else {
                  console.log("No 'Remember Me' checkbox found");
                }

                // Final check before submission
                console.log("Form values before submission:", {
                  username: usernameField.value,
                  password: passwordField.value ? "******" : "(empty)",
                  rememberMe: rememberMe ? rememberMe.checked : "N/A"
                });

                // Give React time to process all changes, then click submit
                console.log("Waiting before submission...");
                setTimeout(() => {
                  console.log("Clicking submit button");
                  submitButton.click();

                  // Also try dispatching events directly
                  submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

                  console.log("Login form submitted");
                }, 1500);
              } else {
                console.error("Could not find all required form elements");
              }
            })();
          `

          mainWindow.webContents.executeJavaScript(loginScript)
        }
      })

      return
    } catch (urlError) {
      console.error('Failed to load URL:', urlError)
      // Fall back to the direct config page
      try {
        await mainWindow.loadFile('./src/html/direct-config.html')
        console.log('Loaded direct-config.html as fallback')
      } catch (configError) {
        console.error('Failed to load direct-config.html:', configError)
        await mainWindow.loadFile('./src/html/config.html')
      }
    }
  }

  if (!store.has('init')) {
    store.set('init', true)
  }
}

async function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: store.get('bounds')?.width || defaultWidth,
    height: store.get('bounds')?.height || defaultHeight,
    x: store.get('bounds')?.x || undefined,
    y: store.get('bounds')?.y || undefined,
    webPreferences: {
      nodeIntegration: true, // Enable nodeIntegration for direct access
      contextIsolation: false, // Disable contextIsolation for direct access
      spellcheck: false,
      // DISABLE PRELOAD SCRIPT - it's causing redirect loops
      // preload: path.join(__dirname, '/src/js/preload.js'),
      allowDisplayingInsecureContent: true,
      allowRunningInsecureContent: true,
      sandbox: false,
    },

    icon: path.join(__dirname, '/src/img/128.png'),

    frame: true,
    movable: true,
    resizable: true,
    closable: true,
    darkTheme: true,
    autoHideMenuBar: true,
  })

  // Enable remote module for this window
  remoteMain.enable(mainWindow.webContents)

  const requestHandler = mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: chromeConfig.getHeaders(details.requestHeaders),
    })
  })

  mainWindow.on('closed', () => {
    if (requestHandler && typeof requestHandler.dispose === 'function') {
      requestHandler.dispose()
    }
  })

  // set the main window title
  mainWindow.setTitle('UniFi Protect Viewer')

  // disable automatic app title updates
  mainWindow.on('page-title-updated', function (e) {
    e.preventDefault()
  })

  // save bounds to store on close
  mainWindow.on('close', function () {
    if (store.has('init') && !portable) {
      store.set('bounds', mainWindow.getBounds())
    }
  })

  // and load the index.html of the app.
  await handleWindow(mainWindow)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Initialize store first
  await initializeStore()

  ipcMain.on('reset', handleReset)
  ipcMain.on('restart', handleRestart)
  ipcMain.on('configSave', handleConfigSave)

  ipcMain.handle('configLoad', handleConfigLoad)

  await createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Handle showing a confirmation dialog when resetting the app
  ipcMain.handle('showResetConfirmation', async (event) => {
    const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
      type: 'question',
      buttons: ['Cancel', 'Reset'],
      defaultId: 0,
      title: 'Confirm Reset',
      message: 'Are you sure you want to reset the app settings?',
    })
    return result.response === 1 // Returns true if 'Reset' was clicked
  })
}) // end of whenReady

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
