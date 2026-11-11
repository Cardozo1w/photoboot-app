import { useRef } from 'react'

const REQUIRED_TAPS = 5
const TAP_WINDOW_MS = 2500

interface AdminGestureZoneProps {
  onTriggered: () => void
}

/**
 * Invisible hit zone in the top-left corner. 5 taps within TAP_WINDOW_MS
 * requests admin access (section 4.8) without exposing any visible control
 * a guest could stumble into during an event.
 */
export function AdminGestureZone({ onTriggered }: AdminGestureZoneProps) {
  const tapCount = useRef(0)
  const windowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTap = () => {
    tapCount.current += 1

    if (windowTimer.current) clearTimeout(windowTimer.current)
    windowTimer.current = setTimeout(() => {
      tapCount.current = 0
    }, TAP_WINDOW_MS)

    if (tapCount.current >= REQUIRED_TAPS) {
      tapCount.current = 0
      if (windowTimer.current) clearTimeout(windowTimer.current)
      onTriggered()
    }
  }

  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      onClick={handleTap}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 64,
        height: 64,
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        zIndex: 9999,
      }}
    />
  )
}
