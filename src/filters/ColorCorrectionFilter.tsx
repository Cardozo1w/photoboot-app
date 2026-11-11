interface ColorCorrectionFilterProps {
  filterId: string
  matrixValues: string
}

/** Hidden SVG hosting the feColorMatrix that `renderFrame.ts` references via `url(#id)`. */
export function ColorCorrectionFilter({ filterId, matrixValues }: ColorCorrectionFilterProps) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id={filterId} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={matrixValues} />
      </filter>
    </svg>
  )
}
