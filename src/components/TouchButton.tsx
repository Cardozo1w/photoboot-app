import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './TouchButton.css'

interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}

/**
 * Baseline touch target for the whole app. Never relies on :hover for any
 * visual state (section 9) — active/pressed feedback comes from :active
 * only, since kiosk hardware has no mouse.
 */
export function TouchButton({
  children,
  variant = 'primary',
  className = '',
  ...buttonProps
}: TouchButtonProps) {
  return (
    <button className={`touch-button touch-button--${variant} ${className}`} {...buttonProps}>
      {children}
    </button>
  )
}
