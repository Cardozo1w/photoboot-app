import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { drawBlush, type FaceBox } from './skinMask'

export interface RenderBuffers {
  /** Mirrored + color-corrected frame, at output size. Also the source for blurring. */
  corrected: HTMLCanvasElement
  /** Scratch buffer for the clarify (screen-blend) pass. */
  blurred: HTMLCanvasElement
}

export function createRenderBuffers(width: number, height: number): RenderBuffers {
  const corrected = document.createElement('canvas')
  const blurred = document.createElement('canvas')
  corrected.width = blurred.width = width
  corrected.height = blurred.height = height
  return { corrected, blurred }
}

export function resizeRenderBuffers(buffers: RenderBuffers, width: number, height: number): void {
  buffers.corrected.width = buffers.blurred.width = width
  buffers.corrected.height = buffers.blurred.height = height
}

export interface RetouchLayer {
  canvas: HTMLCanvasElement
  box: FaceBox
}

export interface RenderFrameOptions {
  colorFilterId: string
  /** Opacity for the precomputed frequency-separation retouch layer (blemish/tone smoothing, texture preserved). */
  smoothingIntensity: number
  retouchLayer: RetouchLayer | null
  /** Gentle overall tone lift via 'screen' blend — cheap, recomputed every frame. */
  clarifyIntensity: number
  skinMaskCanvas: HTMLCanvasElement | null
  /** Soft cheek flush, blended with 'soft-light' so it follows the face's real shading. */
  blushIntensity: number
  landmarks: NormalizedLandmark[] | null
  blurPx: number
}

/**
 * Draws one composited photo-booth frame: mirror + color/light correction
 * always, then (if a face was found) layered skin retouching — a
 * precomputed frequency-separation smoothing layer, a light tone-clarify
 * pass, and blush — on top. Used both for the live preview loop (where the
 * retouch layer is cached and only recomputed a few times a second) and
 * the one-shot full-resolution capture.
 */
export function renderPhotoBoothFrame(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  buffers: RenderBuffers,
  options: RenderFrameOptions,
): void {
  const correctedCtx = buffers.corrected.getContext('2d')
  if (!correctedCtx) return

  correctedCtx.save()
  correctedCtx.filter = `url(#${options.colorFilterId})`
  correctedCtx.setTransform(-1, 0, 0, 1, width, 0)
  correctedCtx.drawImage(video, 0, 0, width, height)
  correctedCtx.restore()

  targetCtx.setTransform(1, 0, 0, 1, 0, 0)
  targetCtx.drawImage(buffers.corrected, 0, 0)

  if (options.retouchLayer && options.smoothingIntensity > 0) {
    targetCtx.save()
    targetCtx.globalAlpha = Math.min(1, options.smoothingIntensity)
    targetCtx.drawImage(options.retouchLayer.canvas, options.retouchLayer.box.x, options.retouchLayer.box.y)
    targetCtx.restore()
  }

  if (options.clarifyIntensity > 0 && options.skinMaskCanvas) {
    const blurredCtx = buffers.blurred.getContext('2d')
    if (blurredCtx) {
      blurredCtx.clearRect(0, 0, width, height)
      blurredCtx.filter = `blur(${options.blurPx}px)`
      blurredCtx.drawImage(buffers.corrected, 0, 0)
      blurredCtx.filter = 'none'
      blurredCtx.globalCompositeOperation = 'destination-in'
      blurredCtx.drawImage(options.skinMaskCanvas, 0, 0)
      blurredCtx.globalCompositeOperation = 'source-over'

      targetCtx.save()
      targetCtx.globalCompositeOperation = 'screen'
      targetCtx.globalAlpha = Math.min(1, options.clarifyIntensity)
      targetCtx.drawImage(buffers.blurred, 0, 0)
      targetCtx.restore()
    }
  }

  if (options.blushIntensity > 0 && options.landmarks) {
    drawBlush(targetCtx, options.landmarks, width, height, options.blushIntensity)
  }
}
