export interface RetouchStyle {
  id: string
  label: string
  brightness: number
  contrast: number
  /** Multiplies Admin's configured skin-smoothing intensity for this style. */
  smoothingMultiplier: number
  /** Tone-evening / blemish-lifting strength (0..1), fixed per style. */
  clarify: number
  /** Cheek flush strength (0..1), fixed per style. */
  blush: number
}

// Real photographic retouching — light, skin evenness, and a soft flush —
// not painted-on color elements. Warmth stays whatever Admin has tuned
// (it's a camera-calibration setting, not a "look").
export const RETOUCH_STYLES: RetouchStyle[] = [
  {
    id: 'natural',
    label: 'Natural',
    brightness: 0.02,
    contrast: 1.04,
    smoothingMultiplier: 1,
    clarify: 0.12,
    blush: 0.05,
  },
  {
    id: 'piel-perfecta',
    label: 'Piel Perfecta',
    brightness: 0.03,
    contrast: 1.02,
    smoothingMultiplier: 1.7,
    clarify: 0.32,
    blush: 0.06,
  },
  {
    id: 'glow',
    label: 'Glow',
    brightness: 0.05,
    contrast: 1.06,
    smoothingMultiplier: 1.3,
    clarify: 0.38,
    blush: 0.16,
  },
  {
    id: 'hd',
    label: 'HD Nítido',
    brightness: 0,
    contrast: 1.1,
    smoothingMultiplier: 0.15,
    clarify: 0.03,
    blush: 0,
  },
]

export const DEFAULT_RETOUCH_ID = 'natural'

export function getRetouchStyle(id: string): RetouchStyle {
  return RETOUCH_STYLES.find((s) => s.id === id) ?? RETOUCH_STYLES[0]
}
