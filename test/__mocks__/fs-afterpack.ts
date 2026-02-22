// Partial fs mock for afterPack.js — overrides readdirSync to return
// a canned Frameworks directory listing, delegates everything else to real fs.
const realFs = require('fs') as typeof import('fs')

const frameworksEntries = [
  'Electron Framework.framework',
  'Mantle.framework',
  'ReactiveObjC.framework',
  'Helper (GPU).app',
  'Helper (Renderer).app',
  'Helper.app',
]

module.exports = {
  ...realFs,
  readdirSync: (dir: string, ...args: any[]) => {
    if (typeof dir === 'string' && dir.includes('Frameworks')) {
      return frameworksEntries
    }
    return realFs.readdirSync(dir, ...args)
  },
}
