import type { UIState } from './state'

/** Callback registered with uiController to update a button's DOM on state changes */
export type ButtonUpdater = (state: UIState) => void

/** Options for creating a header button */
export interface HeaderButtonOptions {
  id: string
  label: string
  onClick: () => void
  updateContent?: (button: HTMLButtonElement, icons?: Record<string, string>) => void
  icons?: Record<string, string>
}

/** Options for creating a nav sidebar button */
export interface NavButtonOptions {
  id: string
  tooltip: string
  onClick: () => void
  content: string
}
