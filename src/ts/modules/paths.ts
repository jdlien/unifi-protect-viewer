/**
 * Centralized path utility for resolving HTML, CSS, image, and preload paths.
 *
 * Uses app.getAppPath() to get the project/app root, eliminating fragile
 * __dirname chains between the compiled `out/` tree and source `src/` tree.
 *
 * Main process only — app is not available in the renderer.
 */

import * as path from 'node:path'

const { app } = require('electron') as typeof import('electron')

function getAppRoot(): string {
  return app.getAppPath()
}

export function htmlPath(file: string): string {
  return path.join(getAppRoot(), 'src', 'html', file)
}

export function imgPath(file: string): string {
  return path.join(getAppRoot(), 'src', 'img', file)
}

export function cssPath(file: string): string {
  return path.join(getAppRoot(), 'src', 'css', file)
}

export function preloadPath(): string {
  return path.join(getAppRoot(), 'out', 'src', 'ts', 'preload.js')
}

export function downloadPreloadPath(): string {
  return path.join(getAppRoot(), 'out', 'src', 'ts', 'download-preload.js')
}
