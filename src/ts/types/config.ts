export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface AppConfig {
  url?: string
  username?: string
  password?: string
  hideNav?: boolean
  hideHeader?: boolean
  ignoreCertErrors?: boolean
  bounds?: WindowBounds
  loginAttempts?: number
  loginAttemptsResetTime?: number
}
