import type { FaceBox } from './skinMask'

/**
 * Crops just the face region from the video, mirrored + color-corrected to
 * match the rest of the render pipeline. Working from the raw video (not a
 * previously-drawn full-frame buffer) keeps this self-contained: it's used
 * both by the live preview's throttled retouch cache and by the one-shot
 * full-resolution capture, with identical results.
 */
function cropCorrectedRegion(video: HTMLVideoElement, colorFilterId: string, box: FaceBox): HTMLCanvasElement {
  const w = Math.round(box.width)
  const h = Math.round(box.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas

  // box.x/box.y are in mirrored output space; map back to the matching
  // (unmirrored) region of the source video.
  const sourceX = video.videoWidth - (box.x + box.width)
  ctx.filter = `url(#${colorFilterId})`
  ctx.setTransform(-1, 0, 0, 1, w, 0)
  ctx.drawImage(video, sourceX, box.y, w, h, 0, 0, w, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  return canvas
}

/**
 * Frequency-separation skin retouch: split the face region into a
 * low-frequency layer (blurred — tone, blotches, blemishes) and a
 * high-frequency layer (original minus blurred, centered on neutral gray —
 * pores, fine texture, real edges), then recombine with 'overlay'
 * compositing. This is the technique professional retouching tools use
 * (Photoshop "frequency separation", AR beauty SDKs) — it removes blotchy
 * tone and small blemishes while keeping skin looking like skin, instead of
 * the flat blur-and-blend approach that reads as "plastic".
 *
 * Returns a canvas sized to `box`, already masked/feathered — draw it at
 * `box.x, box.y` with globalAlpha = desired intensity.
 */
export function buildRetouchLayer(
  video: HTMLVideoElement,
  colorFilterId: string,
  box: FaceBox,
  skinMaskCanvas: HTMLCanvasElement,
  blurPx: number,
  detailOpacity: number,
): HTMLCanvasElement {
  const w = Math.round(box.width)
  const h = Math.round(box.height)

  const original = cropCorrectedRegion(video, colorFilterId, box)
  const originalCtx = original.getContext('2d', { willReadFrequently: true })

  const blurred = document.createElement('canvas')
  blurred.width = w
  blurred.height = h
  const blurredCtx = blurred.getContext('2d', { willReadFrequently: true })

  if (!originalCtx || !blurredCtx) return blurred

  blurredCtx.filter = `blur(${blurPx}px)`
  blurredCtx.drawImage(original, 0, 0)
  blurredCtx.filter = 'none'

  const originalData = originalCtx.getImageData(0, 0, w, h)
  const blurredData = blurredCtx.getImageData(0, 0, w, h)
  const detail = originalCtx.createImageData(w, h)
  const od = originalData.data
  const bd = blurredData.data
  const dd = detail.data
  for (let i = 0; i < od.length; i += 4) {
    dd[i] = od[i] - bd[i] + 128
    dd[i + 1] = od[i + 1] - bd[i + 1] + 128
    dd[i + 2] = od[i + 2] - bd[i + 2] + 128
    dd[i + 3] = 255
  }
  originalCtx.putImageData(detail, 0, 0)

  blurredCtx.globalAlpha = Math.min(1, detailOpacity)
  blurredCtx.globalCompositeOperation = 'overlay'
  blurredCtx.drawImage(original, 0, 0)
  blurredCtx.globalCompositeOperation = 'source-over'
  blurredCtx.globalAlpha = 1

  const maskCrop = document.createElement('canvas')
  maskCrop.width = w
  maskCrop.height = h
  const maskCropCtx = maskCrop.getContext('2d')
  if (maskCropCtx) {
    maskCropCtx.drawImage(skinMaskCanvas, box.x, box.y, w, h, 0, 0, w, h)
    blurredCtx.globalCompositeOperation = 'destination-in'
    blurredCtx.drawImage(maskCrop, 0, 0)
    blurredCtx.globalCompositeOperation = 'source-over'
  }

  return blurred
}
