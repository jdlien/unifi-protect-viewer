/**
 * Centralized DOM selectors for E2E tests.
 * Single file to update when Protect changes its class names.
 */

/** Selectors for elements we inject (stable IDs) */
export const OUR = {
  sidebarButton: '#sidebar-button',
  sidebarButtonLabel: '#sidebar-button-label',
  sidebarButtonIcon: '#sidebar-icon',
  fullscreenButton: '#fullscreen-button',
  fullscreenButtonLabel: '#fullscreen-button-label',
  fullscreenButtonIcon: '#fullscreen-icon',
  headerToggleButton: '#header-toggle-button',
  dashboardButton: '#dashboard-button',
  buttonStyles: '#unifi-protect-viewer-button-styles',
  fastZoomStyle: '#upv-fast-zoom',
  showNavPopup: '#show-nav-popup',

  // Config page elements
  configForm: '#configForm',
  configUrl: '#url',
  configUsername: '#username',
  configPassword: '#password',
  configIgnoreCert: '#ignoreCertErrors',
  configConnectBtn: '#connectBtn',
  configError: '#error',
  configStatus: '#statusMessage',
  configHotkey: '#configHotkey',
  diagnosticsSection: '#diagnosticsSection',
  diagnosticsBody: '#diagnosticsBody',
  spinner: '#spinner',
} as const

/** Selectors for Protect's UI (fragile - will break when Protect updates) */
export const PROTECT = {
  cameraViewport: '[data-viewport]',
  cameraViewportN: (n: number) => `[data-viewport="${n}"]`,
  clickOverlay: '[class*=ClickCaptureOverlay__Root]',
  cameraName: '[class*=CameraName]',
  zoomableViewport: '[class*=ZoomableViewport]',
  fullscreenWrapper: '[class^=liveView__FullscreenWrapper]',
  dashboardContent: '[class^=dashboard__Content]',
  widgetPanel: '[class*=dashboard__Widgets]',
  expandButton: '[class*=dashboard__StyledExpandButton] button',
  liveViewWrapper: '[class^=liveView__LiveViewWrapper]',
  viewportsWrapper: '[class^=liveview__ViewportsWrapper]',
  loginUsername: 'input[name="username"]',
  loginPassword: 'input[type="password"]',
  loginSubmit: 'button[type="submit"]',
} as const
