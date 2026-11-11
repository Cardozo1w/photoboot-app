export interface ColorAdjustments {
  /** -1 (max cool/red-correction) .. 0 (off) .. 1 (max warm push) */
  warmth: number
  /** Additive lift in 0..1 color space, roughly -0.1..0.1. */
  brightness: number
  /** Multiplier around the midpoint; 1 = no change. */
  contrast: number
}

/**
 * Per-channel color correction + brightness/contrast, expressed as a
 * single SVG feColorMatrix so it's one GPU-accelerated pass instead of
 * three. Warmth scales the red/blue channels directly (the correct way to
 * counteract a warm/red camera white-balance cast — a plain hue-rotate
 * rotates ALL hues uniformly and can't target "too much red" cleanly).
 * Brightness/contrast apply globally so a retouch style reads as one
 * consistent look instead of a color change stapled onto flat lighting.
 */
export function buildColorMatrixValues({ warmth, brightness, contrast }: ColorAdjustments): string {
  const clampedWarmth = Math.min(1, Math.max(-1, warmth))
  const redGain = (1 + clampedWarmth * 0.35) * contrast
  const greenGain = (1 + clampedWarmth * 0.05) * contrast
  const blueGain = (1 - clampedWarmth * 0.25) * contrast
  // Re-centers the midpoint after scaling by contrast, then adds the
  // brightness lift on top.
  const offset = brightness + (0.5 - 0.5 * contrast)

  // prettier-ignore
  return [
    redGain, 0, 0, 0, offset,
    0, greenGain, 0, 0, offset,
    0, 0, blueGain, 0, offset,
    0, 0, 0, 1, 0,
  ].join(' ')
}
