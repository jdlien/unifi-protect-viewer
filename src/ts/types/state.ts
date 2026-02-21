/** Public-facing UI state snapshot returned by getState() */
export interface UIState {
  navHidden: boolean
  headerHidden: boolean
  isFullscreen: boolean
}

/** Internal state including flags not exposed to consumers */
export interface UIInternalState extends UIState {
  toggleInProgress: boolean
  initialized: boolean
}
