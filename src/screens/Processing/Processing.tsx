import { useEffect } from 'react'
import type { ScreenProps } from '../ScreenProps'

// Minimum time the spinner stays up so it doesn't flash for guests on a
// fast machine — the actual work here (saving raw shots) usually finishes
// well under this. Fase 4/5 add the real compositing work in this same
// window (frame + filters baked in at print resolution).
const MIN_PROCESSING_MS = 800

export function Processing({ context, send }: ScreenProps) {
  useEffect(() => {
    const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS))

    const save = context.sessionId
      ? window.photobooth.session.saveShots({
          sessionId: context.sessionId,
          mode: 'strip',
          shots: context.capturedShots,
        })
      : Promise.resolve(null)

    save
      .then((result) => {
        if (result && !result.ok) {
          window.photobooth.log.error(`Failed to save session shots: ${result.error}`)
        }
      })
      .catch(() => {
        window.photobooth.log.error('session:saveShots IPC call rejected')
      })

    Promise.all([minDelay, save.catch(() => null)]).then(() => {
      send({ type: 'PROCESSING_COMPLETE' })
    })
  }, [context.sessionId, context.capturedShots, send])

  return (
    <div className="screen">
      <div className="screen__spinner" />
      <p>Preparando tu foto...</p>
    </div>
  )
}
