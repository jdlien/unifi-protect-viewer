// Get the actual Chrome version from Electron
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

// Get the platform version
const getPlatformVersion = () => {
  switch (process.platform) {
    case 'darwin':
      return process.getSystemVersion() // Returns something like "14.1.0"
    case 'win32':
      return process.getSystemVersion() // Returns something like "10.0.19045"
    case 'linux':
      return process.getSystemVersion() // Returns kernel version
    default:
      return '10_15_7' // Fallback
  }
}

module.exports = {
  CHROME_VERSION,
  CHROME_FULL_VERSION,
  userAgent: `Mozilla/5.0 (${process.arch === 'arm64' ? 'Macintosh' : 'Intel Mac OS X'} ${getPlatformVersion()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`,
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
