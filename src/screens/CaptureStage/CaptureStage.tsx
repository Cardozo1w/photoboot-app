import { useEffect, useId, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { TouchButton } from '../../components/TouchButton'
import { useCamera } from '../../hooks/useCamera'
import { useConfig } from '../../hooks/useConfig'
import { useLiveRenderCanvas } from '../../hooks/useLiveRenderCanvas'
import { ColorCorrectionFilter } from '../../filters/ColorCorrectionFilter'
import { buildColorMatrixValues } from '../../filters/colorCorrection'
import { RETOUCH_STYLES, DEFAULT_RETOUCH_ID, getRetouchStyle } from '../../filters/retouchStyles'
import { buildSkinMaskCanvas, computeFaceBox } from '../../filters/skinMask'
import { buildRetouchLayer } from '../../filters/frequencySeparation'
import { createRenderBuffers, renderPhotoBoothFrame, type RetouchLayer } from '../../filters/renderFrame'
import type { ScreenProps } from '../ScreenProps'
import './CaptureStage.css'

export type CaptureStagePhase = 'preview' | 'countdown' | 'capturing'

interface CaptureStageProps extends ScreenProps {
  phase: CaptureStagePhase
}

const COUNTDOWN_START = 3
const TICK_MS = 1000
const FLASH_MS = 400
const DEFAULT_LIGHTING_WARMTH = -0.5
const DEFAULT_SMOOTHING = 0.35
const PREVIEW_BLUR_PX = 5
const RETOUCH_DETAIL_OPACITY = 0.85

interface RetouchIntensities {
  smoothingIntensity: number
  clarifyIntensity: number
  blushIntensity: number
}

/** One-off full-resolution capture, reusing the same render pipeline the live preview uses. */
function captureFullResFrame(
  video: HTMLVideoElement,
  colorFilterId: string,
  intensities: RetouchIntensities,
  landmarks: NormalizedLandmark[] | null,
): string {
  const width = video.videoWidth
  const height = video.videoHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const buffers = createRenderBuffers(width, height)
  const skinMaskCanvas = landmarks ? buildSkinMaskCanvas(landmarks, width, height) : null
  const faceBox = landmarks ? computeFaceBox(landmarks, width, height) : null
  const retouchLayer: RetouchLayer | null =
    faceBox && skinMaskCanvas && intensities.smoothingIntensity > 0
      ? {
          canvas: buildRetouchLayer(video, colorFilterId, faceBox, skinMaskCanvas, PREVIEW_BLUR_PX, RETOUCH_DETAIL_OPACITY),
          box: faceBox,
        }
      : null

  renderPhotoBoothFrame(ctx, video, width, height, buffers, {
    colorFilterId,
    ...intensities,
    retouchLayer,
    skinMaskCanvas,
    landmarks,
    blurPx: PREVIEW_BLUR_PX,
  })

  return canvas.toDataURL('image/png')
}

// The camera feed mounts once and stays alive across livePreview →
// countdown → capturing (and back to countdown for the multi-shot loop).
// Splitting those into separate screen components would tear down and
// rebuild getUserMedia on every countdown, which is slow and would flash
// a black frame each time. The strip-shaped layout lives on the Selecting
// screen instead — while posing/shooting, guests just get a plain
// fullscreen mirror.
export function CaptureStage({ context, phase, send }: CaptureStageProps) {
  const config = useConfig()
  const { videoRef, status, error } = useCamera(config?.camera.deviceId || undefined)
  const colorFilterId = useId()
  const [count, setCount] = useState(COUNTDOWN_START)
  const [retouchId, setRetouchId] = useState(DEFAULT_RETOUCH_ID)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const lastCameraStatusSent = useRef<'ready' | 'error' | null>(null)
  const hasCapturedRef = useRef(false)
  const latestLandmarksRef = useRef<NormalizedLandmark[] | null>(null)

  const lightingWarmth = config?.filters.lightingWarmth ?? DEFAULT_LIGHTING_WARMTH
  const adminSmoothing = config?.filters.beautyIntensity ?? DEFAULT_SMOOTHING
  const retouch = getRetouchStyle(retouchId)
  const intensities: RetouchIntensities = {
    smoothingIntensity: Math.min(1, adminSmoothing * retouch.smoothingMultiplier),
    clarifyIntensity: retouch.clarify,
    blushIntensity: retouch.blush,
  }
  const matrixValues = buildColorMatrixValues({
    warmth: lightingWarmth,
    brightness: retouch.brightness,
    contrast: retouch.contrast,
  })

  // `intensities` is a fresh object every render; read the latest value
  // from a ref inside the capture timeout instead of closing over it, so a
  // stray parent re-render during the 400ms flash window can't cancel the
  // capture (see the capturing effect below).
  const intensitiesRef = useRef(intensities)
  intensitiesRef.current = intensities

  useLiveRenderCanvas({
    videoRef,
    colorFilterId,
    ...intensities,
    blurPx: PREVIEW_BLUR_PX,
    active: status === 'ready',
    onFrame: (master, width, height, landmarks) => {
      latestLandmarksRef.current = landmarks
      const canvas = previewCanvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.drawImage(master, 0, 0)
    },
  })

  useEffect(() => {
    if (status === 'error' && lastCameraStatusSent.current !== 'error') {
      lastCameraStatusSent.current = 'error'
      send({ type: 'CAMERA_ERROR' })
    } else if (status === 'ready' && lastCameraStatusSent.current !== 'ready') {
      lastCameraStatusSent.current = 'ready'
      send({ type: 'CAMERA_RECOVERED' })
    }
  }, [status, send])

  useEffect(() => {
    if (phase !== 'countdown') {
      setCount(COUNTDOWN_START)
      return
    }
    if (count <= 0) {
      send({ type: 'COUNTDOWN_COMPLETE' })
      return
    }
    const timer = setTimeout(() => setCount((c) => c - 1), TICK_MS)
    return () => clearTimeout(timer)
  }, [phase, count, send])

  useEffect(() => {
    if (phase !== 'capturing') {
      hasCapturedRef.current = false
      return
    }
    if (hasCapturedRef.current) return
    hasCapturedRef.current = true

    const timer = setTimeout(() => {
      const video = videoRef.current
      const dataUrl =
        video && video.videoWidth > 0
          ? captureFullResFrame(video, colorFilterId, intensitiesRef.current, latestLandmarksRef.current)
          : ''
      send({ type: 'SHOT_CAPTURED', dataUrl })
    }, FLASH_MS)
    return () => clearTimeout(timer)
  }, [phase, videoRef, colorFilterId, send])

  return (
    <div className="capture-stage">
      <ColorCorrectionFilter filterId={colorFilterId} matrixValues={matrixValues} />
      <video ref={videoRef} autoPlay playsInline muted className="capture-stage__video-source" />
      <canvas ref={previewCanvasRef} className="capture-stage__canvas" />

      {status === 'error' && (
        <div className="capture-stage__overlay">
          <div className="screen__camera-error">
            <p>No se detecta la cámara.</p>
            {error && <p className="screen--idle__hint">{error}</p>}
            <p className="screen--idle__hint">Reintentando automáticamente...</p>
          </div>
        </div>
      )}

      {phase === 'preview' && status === 'ready' && (
        <>
          <div className="capture-stage__filters">
            {RETOUCH_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`capture-stage__filter-pill ${retouchId === style.id ? 'capture-stage__filter-pill--active' : ''}`}
                onClick={() => setRetouchId(style.id)}
              >
                {style.label}
              </button>
            ))}
          </div>
          <div className="capture-stage__controls">
            <TouchButton onClick={() => send({ type: 'CAPTURE_PRESSED' })}>Capturar</TouchButton>
            <TouchButton variant="secondary" onClick={() => send({ type: 'BACK' })}>
              Atrás
            </TouchButton>
          </div>
        </>
      )}

      {phase === 'countdown' && (
        <div className="capture-stage__overlay">
          <p className="screen--countdown__shot-label">
            Foto {context.shotsTaken + 1} de {context.candidateShotsNeeded}
          </p>
          <span className="screen--countdown__number">{count > 0 ? count : '📸'}</span>
        </div>
      )}

      {phase === 'capturing' && <div className="screen--flash capture-stage__flash" />}
    </div>
  )
}
