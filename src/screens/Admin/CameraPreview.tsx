import { useId, useRef } from 'react'
import { useCamera } from '../../hooks/useCamera'
import { useLiveRenderCanvas } from '../../hooks/useLiveRenderCanvas'
import { ColorCorrectionFilter } from '../../filters/ColorCorrectionFilter'
import { buildColorMatrixValues } from '../../filters/colorCorrection'
import { getRetouchStyle, DEFAULT_RETOUCH_ID } from '../../filters/retouchStyles'
import './CameraPreview.css'

interface CameraPreviewProps {
  deviceId?: string
  lightingWarmth: number
  beautyIntensity: number
}

// Reused in both the Cámara tab (pick a device) and the Filtros tab (tune
// live) so an operator can calibrate against the exact render pipeline the
// booth uses — same color correction + beauty compositing as CaptureStage,
// not just an approximation — see section 4.8's "preview de prueba".
export function CameraPreview({ deviceId, lightingWarmth, beautyIntensity }: CameraPreviewProps) {
  const { videoRef, status, error } = useCamera(deviceId)
  const colorFilterId = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const naturalStyle = getRetouchStyle(DEFAULT_RETOUCH_ID)

  useLiveRenderCanvas({
    videoRef,
    colorFilterId,
    smoothingIntensity: beautyIntensity,
    clarifyIntensity: naturalStyle.clarify,
    blushIntensity: naturalStyle.blush,
    blurPx: 5,
    active: status === 'ready',
    onFrame: (master, width, height) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.drawImage(master, 0, 0)
    },
  })

  return (
    <div className="admin-camera-preview">
      <ColorCorrectionFilter
        filterId={colorFilterId}
        matrixValues={buildColorMatrixValues({
          warmth: lightingWarmth,
          brightness: naturalStyle.brightness,
          contrast: naturalStyle.contrast,
        })}
      />
      <video ref={videoRef} autoPlay playsInline muted className="admin-camera-preview__video-source" />
      <canvas ref={canvasRef} className="admin-camera-preview__canvas" />
      {status === 'starting' && <p className="admin-camera-preview__hint">Conectando...</p>}
      {status === 'error' && <p className="admin-camera-preview__hint">{error ?? 'Sin cámara detectada'}</p>}
    </div>
  )
}
