import { TouchButton } from '../../components/TouchButton'
import type { ScreenProps } from '../ScreenProps'

export function Idle({ send }: ScreenProps) {
  return (
    <div className="screen screen--idle" onClick={() => send({ type: 'TOUCH' })}>
      <h1>Photo Booth</h1>
      <p className="screen--idle__hint">Toca la pantalla para comenzar</p>
      <TouchButton onClick={() => send({ type: 'TOUCH' })}>Toca para empezar</TouchButton>
    </div>
  )
}
