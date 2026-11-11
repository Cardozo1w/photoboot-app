import { useEffect, useRef } from 'react'
import { TouchButton } from '../../components/TouchButton'
import type { ScreenProps } from '../ScreenProps'

export type DeliveryPhase =
  | 'deciding'
  | 'printing'
  | 'printError'
  | 'savingPdf'
  | 'pdfError'
  | 'done'

interface DeliveryProps extends ScreenProps {
  phase: DeliveryPhase
}

const GENERIC_ERROR = 'Error desconocido'

// Runs the actual print/PDF job (Fase 3's runPrintJob, via IPC). The main
// process picks PdfPrintProvider or PhysicalPrintProvider based on Admin's
// printer.mode — this component only cares about which screen to show and
// which machine event to send back.
export function Delivery({ context, phase, send }: DeliveryProps) {
  const lastRunPhase = useRef<DeliveryPhase | null>(null)

  useEffect(() => {
    if (phase !== 'printing' && phase !== 'savingPdf') {
      lastRunPhase.current = null
      return
    }
    if (lastRunPhase.current === phase) return
    lastRunPhase.current = phase
    if (!context.sessionId) return

    window.photobooth.print
      .run({ sessionId: context.sessionId, mode: 'strip', shots: context.capturedShots })
      .then((result) => {
        if (phase === 'printing') {
          send(result.ok ? { type: 'PRINT_SUCCESS' } : { type: 'PRINT_ERROR', message: result.error ?? GENERIC_ERROR })
        } else {
          send(result.ok ? { type: 'PDF_SAVED' } : { type: 'PDF_ERROR', message: result.error ?? GENERIC_ERROR })
        }
      })
      .catch(() => {
        send(
          phase === 'printing'
            ? { type: 'PRINT_ERROR', message: GENERIC_ERROR }
            : { type: 'PDF_ERROR', message: GENERIC_ERROR },
        )
      })
  }, [phase, context.sessionId, context.capturedShots, send])

  if (phase === 'printing' || phase === 'deciding') {
    return (
      <div className="screen">
        <div className="screen__spinner" />
        <p>Imprimiendo...</p>
      </div>
    )
  }

  if (phase === 'printError') {
    return (
      <div className="screen">
        <h1>No se pudo imprimir</h1>
        <p>{context.lastError ?? 'Error desconocido de impresora.'}</p>
        <div className="screen__button-row">
          <TouchButton onClick={() => send({ type: 'RETRY_PRINT' })}>Reintentar</TouchButton>
          <TouchButton variant="secondary" onClick={() => send({ type: 'FALLBACK_TO_PDF' })}>
            Guardar como PDF
          </TouchButton>
        </div>
      </div>
    )
  }

  if (phase === 'savingPdf') {
    return (
      <div className="screen">
        <div className="screen__spinner" />
        <p>Guardando tu foto...</p>
      </div>
    )
  }

  if (phase === 'pdfError') {
    return (
      <div className="screen">
        <h1>No se pudo guardar</h1>
        <p>{context.lastError ?? 'Error desconocido al guardar el PDF.'}</p>
        <TouchButton onClick={() => send({ type: 'RETRY_PRINT' })}>Reintentar</TouchButton>
      </div>
    )
  }

  return (
    <div className="screen">
      <span className="screen--delivery__check">✓</span>
      <h1>¡Listo! Tu foto se guardó</h1>
      <TouchButton onClick={() => send({ type: 'DELIVERY_DONE' })}>Terminar</TouchButton>
    </div>
  )
}
