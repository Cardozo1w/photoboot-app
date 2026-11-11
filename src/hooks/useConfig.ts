import { useEffect, useState } from 'react'
import type { PhotoBoothConfig } from '../../electron/store'

export function useConfig(): PhotoBoothConfig | null {
  const [config, setConfig] = useState<PhotoBoothConfig | null>(null)

  useEffect(() => {
    window.photobooth.config.get().then(setConfig)
  }, [])

  return config
}
