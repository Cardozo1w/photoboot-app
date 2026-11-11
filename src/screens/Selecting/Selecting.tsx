import { useState } from 'react'
import { TouchButton } from '../../components/TouchButton'
import { StripPreview } from '../../components/StripPreview'
import { useConfig } from '../../hooks/useConfig'
import type { ScreenProps } from '../ScreenProps'
import './Selecting.css'

export function Selecting({ context, send }: ScreenProps) {
  const config = useConfig()
  const [selected, setSelected] = useState<number[]>([])
  const needed = context.finalShotsNeeded

  const toggle = (index: number) => {
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index)
      if (prev.length >= needed) return prev
      return [...prev, index]
    })
  }

  const confirm = () => {
    send({ type: 'SELECTION_CONFIRMED', dataUrls: selected.map((i) => context.capturedShots[i]) })
  }

  const stripSlots = Array.from({ length: needed }, (_, i) =>
    selected[i] !== undefined ? context.capturedShots[selected[i]] : null,
  )

  return (
    <div className="screen">
      <h1>Elige tus favoritas</h1>
      <p className="screen--idle__hint">
        Seleccionadas {selected.length} de {needed} — toca en orden, así queda la tira
      </p>
      <div className="selecting-layout">
        <div className="selecting-grid">
          {context.capturedShots.map((shot, index) => {
            const order = selected.indexOf(index)
            return (
              <button
                key={index}
                type="button"
                className={`selecting-grid__item ${order !== -1 ? 'selecting-grid__item--selected' : ''}`}
                onClick={() => toggle(index)}
              >
                <img src={shot} alt={`Candidata ${index + 1}`} />
                {order !== -1 && <span className="selecting-grid__badge">{order + 1}</span>}
              </button>
            )
          })}
        </div>
        <StripPreview shots={stripSlots} eventName={config?.event.name} />
      </div>
      <div className="screen__button-row">
        <TouchButton variant="secondary" onClick={() => send({ type: 'REPEAT' })}>
          Repetir todas
        </TouchButton>
        <TouchButton onClick={confirm} disabled={selected.length !== needed}>
          Continuar
        </TouchButton>
      </div>
    </div>
  )
}
