/**
 * Recompute SHA512 checksums and file sizes in a latest.yml after code signing.
 *
 * Usage: node scripts/recompute-checksums.js dist/latest.yml
 *
 * Signing modifies exe binaries, invalidating the checksums that
 * electron-builder wrote during the build step. This script reads the
 * YAML, recalculates sha512 + size for every referenced file, and
 * writes the corrected YAML back in place.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ymlPath = process.argv[2]
if (!ymlPath) {
  console.error('Usage: node recompute-checksums.js <path-to-latest.yml>')
  process.exit(1)
}

const dir = path.dirname(path.resolve(ymlPath))
let yml = fs.readFileSync(ymlPath, 'utf8')

function sha512Base64(filePath) {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha512').update(buf).digest('base64')
}

// Update each file entry (url / sha512 / size block)
const lines = yml.split('\n')
const result = []
let currentUrl = null

for (const line of lines) {
  const urlMatch = line.match(/^\s+url:\s+(.+)$/)
  if (urlMatch) {
    currentUrl = urlMatch[1].trim()
    result.push(line)
    continue
  }

  const sha512Match = line.match(/^(\s+)sha512:\s+.+$/)
  if (sha512Match && currentUrl) {
    const filePath = path.join(dir, currentUrl)
    if (fs.existsSync(filePath)) {
      const hash = sha512Base64(filePath)
      result.push(`${sha512Match[1]}sha512: ${hash}`)
      continue
    }
  }

  const sizeMatch = line.match(/^(\s+)size:\s+\d+$/)
  if (sizeMatch && currentUrl) {
    const filePath = path.join(dir, currentUrl)
    if (fs.existsSync(filePath)) {
      const size = fs.statSync(filePath).size
      result.push(`${sizeMatch[1]}size: ${size}`)
      currentUrl = null
      continue
    }
  }

  // Top-level sha512 (references the default/primary file)
  const topSha512 = line.match(/^sha512:\s+.+$/)
  if (topSha512) {
    // Find the top-level path field to know which file this references
    const pathMatch = yml.match(/^path:\s+(.+)$/m)
    if (pathMatch) {
      const filePath = path.join(dir, pathMatch[1].trim())
      if (fs.existsSync(filePath)) {
        const hash = sha512Base64(filePath)
        result.push(`sha512: ${hash}`)
        continue
      }
    }
  }

  result.push(line)
}

fs.writeFileSync(ymlPath, result.join('\n'))
console.log(`Updated checksums in ${ymlPath}`)
