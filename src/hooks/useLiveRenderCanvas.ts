import { useEffect, useRef } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getFaceLandmarker, type FaceLandmarkerHandle } from '../filters/faceLandmarker'
import { buildSkinMaskCanvas, computeFaceBox } from '../filters/skinMask'
import { buildRetouchLayer } from '../filters/frequencySeparation'
import {
  createRenderBuffers,
  renderPhotoBoothFrame,
  type RenderBuffers,
  type RetouchLayer,
} from '../filters/renderFrame'

// Throttles how often the ML model runs (CPU cost) AND how often the
// frequency-separation retouch layer is rebuilt (it does a getImageData/
// putImageData pass, which is comparatively expensive) — not image
// quality. MediaPipe resizes the video frame to its own internal input
// size regardless of source resolution, and a face doesn't move enough in
// ~120ms for a slightly-stale retouch layer to be noticeable.
const DETECTION_INTERVAL_MS = 120
const RETOUCH_DETAIL_OPACITY = 0.85

export type LiveFrameCallback = (
  master: HTMLCanvasElement,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[] | null,
) => void

interface UseLiveRenderCanvasOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  colorFilterId: string
  smoothingIntensity: number
  clarifyIntensity: number
  blushIntensity: number
  blurPx: number
  active: boolean
  onFrame: LiveFrameCallback
}

/**
 * Shared live-render loop: mirrors + color-corrects + retouches the camera
 * feed into an offscreen "master" canvas — at the video's native
 * resolution, so a fullscreen display stays sharp — once per frame, then
 * hands it to the caller via onFrame.
 */
export function useLiveRenderCanvas(options: UseLiveRenderCanvasOptions): void {
  const { videoRef, colorFilterId, smoothingIntensity, clarifyIntensity, blushIntensity, blurPx, active } = options
  const onFrameRef = useRef(options.onFrame)
  onFrameRef.current = options.onFrame

  const masterRef = useRef<HTMLCanvasElement | null>(null)
  const buffersRef = useRef<RenderBuffers | null>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const retouchLayerRef = useRef<RetouchLayer | null>(null)
  const landmarksRef = useRef<NormalizedLandmark[] | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerHandle | null>(null)
  const lastDetectionRef = useRef(0)
  const sizeRef = useRef({ width: 0, height: 0 })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getFaceLandmarker()
      .then((handle) => {
        if (!cancelled) landmarkerRef.current = handle
      })
      .catch(() => {
        // Beauty filter just won't run; lighting correction still applies.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!active) return
    let stopped = false

    const loop = () => {
      if (stopped) return
      const video = videoRef.current

      if (video && video.videoWidth > 0) {
        if (
          sizeRef.current.width !== video.videoWidth ||
          sizeRef.current.height !== video.videoHeight
        ) {
          const width = video.videoWidth
          const height = video.videoHeight
          sizeRef.current = { width, height }
          masterRef.current = document.createElement('canvas')
          masterRef.current.width = width
          masterRef.current.height = height
          buffersRef.current = createRenderBuffers(width, height)
        }
        const { width, height } = sizeRef.current

        const now = performance.now()
        if (landmarkerRef.current && now - lastDetectionRef.current > DETECTION_INTERVAL_MS) {
          lastDetectionRef.current = now
          const landmarks = landmarkerRef.current.detect(video, now)
          landmarksRef.current = landmarks
          if (landmarks) {
            const mask = buildSkinMaskCanvas(landmarks, width, height)
            maskRef.current = mask
            const box = mask ? computeFaceBox(landmarks, width, height) : null
            retouchLayerRef.current =
              box && mask && smoothingIntensity > 0
                ? { canvas: buildRetouchLayer(video, colorFilterId, box, mask, blurPx, RETOUCH_DETAIL_OPACITY), box }
                : null
          } else {
            maskRef.current = null
            retouchLayerRef.current = null
          }
        }

        const master = masterRef.current
        const ctx = master?.getContext('2d')
        if (ctx && buffersRef.current && master) {
          renderPhotoBoothFrame(ctx, video, width, height, buffersRef.current, {
            colorFilterId,
            smoothingIntensity,
            retouchLayer: retouchLayerRef.current,
            clarifyIntensity,
            blushIntensity,
            skinMaskCanvas: maskRef.current,
            landmarks: landmarksRef.current,
            blurPx,
          })
          onFrameRef.current(master, width, height, landmarksRef.current)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      stopped = true
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [active, videoRef, colorFilterId, smoothingIntensity, clarifyIntensity, blushIntensity, blurPx])
}
