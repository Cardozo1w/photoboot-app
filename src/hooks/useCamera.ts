import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'starting' | 'ready' | 'error'

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  captureFrame: (filterCss?: string) => string | null
}

const RETRY_INTERVAL_MS = 4000

export function useCamera(deviceId?: string): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async () => {
    setStatus('starting')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'No se pudo acceder a la cámara')
    }
  }, [deviceId])

  useEffect(() => {
    start()
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [start])

  // Auto-retry in the background while in error state, so a guest doesn't
  // have to tap "retry" if the camera reconnects on its own (e.g. a loose
  // USB cable) — section 9's "resiliencia a desconexión de cámara".
  useEffect(() => {
    if (status !== 'error') return
    const timer = setInterval(start, RETRY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [status, start])

  const captureFrame = useCallback((filterCss?: string): string | null => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // Bake in the same color-correction filter the guest saw live
    // (section 5: "lo que se ve en preview es lo que sale").
    if (filterCss) ctx.filter = filterCss
    // Mirror horizontally so the saved photo matches what the guest saw
    // in the live "mirror" preview (section 4.3).
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }, [])

  return { videoRef, status, error, captureFrame }
}
