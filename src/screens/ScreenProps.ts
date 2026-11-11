import type { PhotoBoothContext, PhotoBoothEvent } from '../state/photoBoothMachine'

export interface ScreenProps {
  context: PhotoBoothContext
  send: (event: PhotoBoothEvent) => void
}
