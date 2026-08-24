import type { PositaDesktopApi } from '../../preload'

declare global {
  interface Window {
    posita: PositaDesktopApi
  }
}

export {}
