import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

interface Zone {
  index: number
  radiusFactor: number
}

// Stable MediaPipe FaceMesh landmark indices (same in the 468 and 478-point
// topologies — iris points are appended after index 467, so these don't
// shift). We deliberately do NOT build a precise face-minus-eyes-minus-
// mouth mask here: instead we soften a few skin-heavy zones (forehead,
// cheeks, chin) with feathered radial falloff, which stays clear of eyes/
// mouth/nostrils by construction as long as the radius is conservative.
// That's a much cheaper real-time approximation of "smooth skin, keep
// features sharp" than true bilateral filtering + segmentation.
const ZONES: Zone[] = [
  { index: 10, radiusFactor: 0.24 }, // forehead
  { index: 50, radiusFactor: 0.22 }, // left cheek
  { index: 280, radiusFactor: 0.22 }, // right cheek
  { index: 152, radiusFactor: 0.16 }, // chin
]

const FACE_LEFT_EDGE = 234
const FACE_RIGHT_EDGE = 454

/**
 * Builds a greyscale alpha mask (white = full effect, transparent = none)
 * for the skin-smoothing compositing step, in the same mirrored coordinate
 * space as the output canvas. Returns null when no reliable face is found.
 */
export function buildSkinMaskCanvas(
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const left = landmarks[FACE_LEFT_EDGE]
  const right = landmarks[FACE_RIGHT_EDGE]
  if (!left || !right) return null

  const faceWidthPx = Math.abs(right.x - left.x) * width
  if (faceWidthPx < 10) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.globalCompositeOperation = 'lighter'
  for (const zone of ZONES) {
    const landmark = landmarks[zone.index]
    if (!landmark) continue
    // Mirrored to match the already-mirrored "corrected" render buffer.
    const cx = width - landmark.x * width
    const cy = landmark.y * height
    const radius = faceWidthPx * zone.radiusFactor
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  }

  return canvas
}

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

const FACE_TOP = 10
const FACE_BOTTOM = 152

/**
 * Bounding box around the face, in the same mirrored output space as
 * everything else, padded to comfortably include forehead/jaw/ears. Used
 * to crop just the face region for the frequency-separation retouch pass
 * instead of processing the whole frame pixel-by-pixel.
 */
export function computeFaceBox(landmarks: NormalizedLandmark[], width: number, height: number): FaceBox | null {
  const top = landmarks[FACE_TOP]
  const bottom = landmarks[FACE_BOTTOM]
  const left = landmarks[FACE_LEFT_EDGE]
  const right = landmarks[FACE_RIGHT_EDGE]
  if (!top || !bottom || !left || !right) return null

  const xs = [left.x, right.x].map((x) => width - x * width)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = top.y * height
  const maxY = bottom.y * height

  const padX = (maxX - minX) * 0.25
  const padY = (maxY - minY) * 0.3

  const x = Math.max(0, minX - padX)
  const y = Math.max(0, minY - padY)
  const boxWidth = Math.min(width - x, maxX - minX + padX * 2)
  const boxHeight = Math.min(height - y, maxY - minY + padY * 2)
  if (boxWidth < 20 || boxHeight < 20) return null

  return { x, y, width: boxWidth, height: boxHeight }
}

const BLUSH_LANDMARKS = [50, 280]
const BLUSH_RADIUS_FACTOR = 0.14

/**
 * Draws a soft cheek flush directly onto targetCtx with 'soft-light'
 * blending — unlike a flat 'multiply' tint (which reads as a pasted-on
 * mask), soft-light respects the underlying pixel's own brightness, so the
 * color follows the face's real highlights/shadows instead of flattening
 * them. Low alpha + a wide feathered gradient keep it from having a
 * visible edge.
 */
export function drawBlush(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  intensity: number,
): void {
  const left = landmarks[FACE_LEFT_EDGE]
  const right = landmarks[FACE_RIGHT_EDGE]
  if (!left || !right) return
  const faceWidthPx = Math.abs(right.x - left.x) * width
  if (faceWidthPx < 10) return

  ctx.save()
  ctx.globalCompositeOperation = 'soft-light'
  const alpha = Math.min(0.5, intensity)
  for (const index of BLUSH_LANDMARKS) {
    const landmark = landmarks[index]
    if (!landmark) continue
    const cx = width - landmark.x * width
    const cy = landmark.y * height
    const radius = faceWidthPx * BLUSH_RADIUS_FACTOR
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    gradient.addColorStop(0, `rgba(255, 140, 140, ${alpha})`)
    gradient.addColorStop(1, 'rgba(255, 140, 140, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  }
  ctx.restore()
}
