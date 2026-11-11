import './StripPreview.css'

interface StripPreviewProps {
  /** One entry per final cell; null renders an empty placeholder slot. */
  shots: (string | null)[]
  eventName?: string
}

/** Mimics pdfProvider's 2x6" strip layout (cells stacked + footer) so guests see what they're building as they pick favorites. */
export function StripPreview({ shots, eventName }: StripPreviewProps) {
  return (
    <div className="strip-preview">
      {shots.map((shot, index) => (
        <div key={index} className="strip-preview__cell">
          {shot ? <img src={shot} alt={`Foto ${index + 1}`} /> : <span className="strip-preview__cell-number">{index + 1}</span>}
        </div>
      ))}
      <div className="strip-preview__footer">{eventName ?? 'Photo Booth'}</div>
    </div>
  )
}
