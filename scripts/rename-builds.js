#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

// Get current directory
const __dirname = path.dirname(require.main.filename)

// Get version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const version = packageJson.version

const baseName = 'UniFi Protect Viewer'

console.log('rename', baseName, version)

// List directories under builds/
const buildDirs = fs.readdirSync('builds').filter((file) => {
  return fs.statSync(path.join('builds', file)).isDirectory()
})

// Rename each directory to include version
buildDirs.forEach((file) => {
  const portable = file.includes('portable')
  const arch = file.replace(`${baseName}${portable ? '-portable' : ''}-`, '')

  const oldName = path.join('builds', file)
  const newName = path.join('builds', `${baseName}-${arch}-${version}${portable ? '-portable' : ''}`)
  console.log(`rename ${oldName} to ${newName}`)
  fs.renameSync(oldName, newName)
})

console.log('Done renaming build directories')
