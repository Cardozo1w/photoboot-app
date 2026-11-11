import { useState } from 'react'
import { TouchButton } from '../../components/TouchButton'

const PIN_LENGTH = 4
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

interface PinPadProps {
  onVerified: () => void
}

export function PinPad({ onVerified }: PinPadProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const handleDigit = async (digit: string) => {
    if (digit === '') return
    setError(false)

    if (digit === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }

    const next = (pin + digit).slice(0, PIN_LENGTH)
    setPin(next)

    if (next.length === PIN_LENGTH) {
      const valid = await window.photobooth.admin.verifyPin(next)
      if (valid) {
        onVerified()
      } else {
        setError(true)
        setPin('')
      }
    }
  }

  return (
    <div className="pin-pad">
      <div className="pin-pad__dots">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span key={i} className={`pin-pad__dot ${i < pin.length ? 'pin-pad__dot--filled' : ''}`} />
        ))}
      </div>
      {error && <p className="pin-pad__error">PIN incorrecto</p>}
      <div className="pin-pad__grid">
        {DIGITS.map((digit, i) => (
          <TouchButton
            key={`${digit}-${i}`}
            variant="secondary"
            disabled={digit === ''}
            onClick={() => handleDigit(digit)}
            style={digit === '' ? { visibility: 'hidden' } : undefined}
          >
            {digit}
          </TouchButton>
        ))}
      </div>
    </div>
  )
}
