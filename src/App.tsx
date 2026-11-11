import { useEffect } from 'react'
import { useMachine } from '@xstate/react'
import { photoBoothMachine } from './state/photoBoothMachine'
import { AdminGestureZone } from './components/AdminGestureZone'
import { Idle } from './screens/Idle/Idle'
import { CaptureStage, type CaptureStagePhase } from './screens/CaptureStage/CaptureStage'
import { Selecting } from './screens/Selecting/Selecting'
import { Processing } from './screens/Processing/Processing'
import { Delivery, type DeliveryPhase } from './screens/Delivery/Delivery'
import { Admin } from './screens/Admin/Admin'
import './App.css'

const CAPTURE_STATES = ['livePreview', 'countdown', 'capturing'] as const

function App() {
  const [state, send] = useMachine(photoBoothMachine)

  // Sync printer mode + theme from persisted config on boot, so settings
  // from a previous session (or a previous event) come back active.
  useEffect(() => {
    window.photobooth.config
      .get()
      .then((config) => {
        send({ type: 'SET_PRINTER_MODE', mode: config.printer.mode })
        document.documentElement.setAttribute('data-theme', config.event.theme)
      })
      .catch(() => {
        window.photobooth.log.error('Failed to load config on startup')
      })
  }, [send])

  const screenProps = { context: state.context, send }
  const captureState = CAPTURE_STATES.find((s) => state.matches(s))

  return (
    <>
      {!state.matches('admin') && <AdminGestureZone onTriggered={() => send({ type: 'ADMIN_REQUESTED' })} />}

      {state.matches('idle') && <Idle {...screenProps} />}
      {captureState && (
        <CaptureStage
          {...screenProps}
          phase={(captureState === 'livePreview' ? 'preview' : captureState) as CaptureStagePhase}
        />
      )}
      {state.matches('selecting') && <Selecting {...screenProps} />}
      {state.matches('processing') && <Processing {...screenProps} />}
      {state.matches('delivery') && (
        <Delivery
          {...screenProps}
          phase={(typeof state.value === 'object' ? state.value.delivery : 'deciding') as DeliveryPhase}
        />
      )}
      {state.matches('admin') && <Admin {...screenProps} />}
    </>
  )
}

export default App
