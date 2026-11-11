import type { PhotoBoothApi } from '../electron/preload'

declare global {
  interface Window {
    photobooth: PhotoBoothApi
  }
}

export {}
