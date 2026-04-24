// Get the actual Chrome version from Electron
import * as os from 'node:os'

const CHROME_VERSION = process.versions.chrome.split('.')[0]
const CHROME_FULL_VERSION = process.versions.chrome

const getPlatformVersion = (): string => os.release().replace(/\./g, '_')

const createUserAgent = (): string => {
  if (process.platform === 'darwin') {
    const isArm = process.arch === 'arm64'
    return `Mozilla/5.0 (Macintosh; ${isArm ? 'Apple Silicon' : 'Intel'} Mac OS X ${getPlatformVersion()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`
  } else if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT ${os.release()}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`
  } else {
    return `Mozilla/5.0 (X11; Linux ${process.arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`
  }
}

export { CHROME_VERSION, CHROME_FULL_VERSION }

export const userAgent: string = createUserAgent()
