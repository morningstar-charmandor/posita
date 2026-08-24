import type { PositaDesktopApi } from '../../shared/contracts'

declare global {
  interface Window {
    posita: PositaDesktopApi
  }
}

export {}
