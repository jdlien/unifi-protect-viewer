// Get the actual Chrome version from Electron
const os = require('node:os')
const CHROME_VERSION = process.versions.chrome.split('.')[0] // Will be "120" for Electron 33.1
const CHROME_FULL_VERSION = process.versions.chrome // Will be "120.0.6099.109"

// Get the actual platform
const getPlatform = () => {
  switch (process.platform) {
    case 'darwin':
      return 'macOS'
    case 'win32':
      return 'Windows'
    case 'linux':
      return 'Linux'
    default:
      return 'Unknown'
  }
}

// Get the platform version in proper format
const getPlatformVersion = () => {
  switch (process.platform) {
    case 'darwin':
      return os.release().replace(/\./g, '_') // Convert 10.15.7 to 10_15_7
    case 'win32':
      return os.release()
    case 'linux':
      return os.release()
    default:
      return '10_15_7' // Fallback
  }
}

// Create properly formatted UA string
const createUserAgent = () => {
  if (process.platform === 'darwin') {
    const isArm = process.arch === 'arm64'
    return `Mozilla/5.0 (Macintosh; ${isArm ? 'Apple Silicon' : 'Intel'} Mac OS X ${getPlatformVersion()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`
  } else if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT ${os.release()}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`
  } else {
    return `Mozilla/5.0 (X11; Linux ${process.arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`
  }
}

module.exports = {
  CHROME_VERSION,
  CHROME_FULL_VERSION,
  userAgent: createUserAgent(),
  brands: [
    { brand: 'Chromium', version: CHROME_VERSION },
    { brand: 'Google Chrome', version: CHROME_VERSION },
    { brand: 'Not?A_Brand', version: '99' },
  ],
  getHeaders: (existingHeaders) => ({
    ...existingHeaders,
    'Sec-CH-UA': `"Chromium";v="${CHROME_VERSION}", "Google Chrome";v="${CHROME_VERSION}", "Not?A_Brand";v="99"`,
    'Sec-CH-UA-Platform': `"${getPlatform()}"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Full-Version': CHROME_FULL_VERSION,
    'Sec-CH-UA-Platform-Version': getPlatformVersion(),
  }),
}
