import { useEffect, useState } from 'react'
import { TouchButton } from '../../components/TouchButton'
import type { ScreenProps } from '../ScreenProps'
import type { PhotoBoothConfig } from '../../../electron/store'
import { PinPad } from './PinPad'
import { CameraPreview } from './CameraPreview'

type AdminTab = 'camera' | 'printer' | 'filters' | 'event' | 'history'

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'camera', label: 'Cámara' },
  { id: 'printer', label: 'Impresora / PDF' },
  { id: 'filters', label: 'Filtros' },
  { id: 'event', label: 'Evento' },
  { id: 'history', label: 'Historial' },
]

export function Admin({ context, send }: ScreenProps) {
  const [unlocked, setUnlocked] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTab>('printer')
  const [config, setConfig] = useState<PhotoBoothConfig | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    if (!unlocked) return
    window.photobooth.config.get().then(setConfig)
  }, [unlocked])

  // Camera labels are only populated once permission has been granted, so
  // we request (and immediately release) a stream before enumerating.
  useEffect(() => {
    if (activeTab !== 'camera') return
    let cancelled = false
    ;(async () => {
      let tempStream: MediaStream | null = null
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
      } catch {
        // No permission / no camera yet — enumerate anyway, labels may be blank.
      }
      const list = await navigator.mediaDevices.enumerateDevices()
      tempStream?.getTracks().forEach((track) => track.stop())
      if (!cancelled) setDevices(list.filter((d) => d.kind === 'videoinput'))
    })()
    return () => {
      cancelled = true
    }
  }, [activeTab])

  const handlePrinterModeChange = (mode: PhotoBoothConfig['printer']['mode']) => {
    send({ type: 'SET_PRINTER_MODE', mode })
    if (!config) return
    window.photobooth.config.update({ printer: { ...config.printer, mode } }).then(setConfig)
  }

  const handleThemeChange = (theme: PhotoBoothConfig['event']['theme']) => {
    document.documentElement.setAttribute('data-theme', theme)
    if (!config) return
    window.photobooth.config.update({ event: { ...config.event, theme } }).then(setConfig)
  }

  const handleDeviceSelect = (deviceId: string) => {
    if (!config) return
    window.photobooth.config.update({ camera: { ...config.camera, deviceId } }).then(setConfig)
  }

  const handleFilterChange = (partial: Partial<PhotoBoothConfig['filters']>) => {
    if (!config) return
    // Update local state immediately so the preview reacts without waiting
    // on the IPC round-trip, then persist.
    const filters = { ...config.filters, ...partial }
    setConfig({ ...config, filters })
    window.photobooth.config.update({ filters }).then(setConfig)
  }

  if (!unlocked) {
    return (
      <div className="screen">
        <h1>Acceso Admin</h1>
        <PinPad onVerified={() => setUnlocked(true)} />
        <TouchButton variant="secondary" onClick={() => send({ type: 'ADMIN_EXIT' })}>
          Cancelar
        </TouchButton>
      </div>
    )
  }

  return (
    <div className="screen screen--admin">
      <h1>Panel de administración</h1>
      <div className="screen__button-row">
        {TABS.map((tab) => (
          <TouchButton
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </TouchButton>
        ))}
      </div>

      <div className="screen__admin-content">
        {activeTab === 'camera' && config && (
          <div className="admin-panel-row">
            <CameraPreview
              deviceId={config.camera.deviceId || undefined}
              lightingWarmth={config.filters.lightingWarmth}
              beautyIntensity={config.filters.beautyIntensity}
            />
            <div className="admin-panel-row__list">
              {devices.length === 0 && <p className="screen--idle__hint">Buscando cámaras...</p>}
              <TouchButton
                variant={config.camera.deviceId === '' ? 'primary' : 'secondary'}
                onClick={() => handleDeviceSelect('')}
              >
                Predeterminada del sistema
              </TouchButton>
              {devices.map((device, index) => (
                <TouchButton
                  key={device.deviceId}
                  variant={config.camera.deviceId === device.deviceId ? 'primary' : 'secondary'}
                  onClick={() => handleDeviceSelect(device.deviceId)}
                >
                  {device.label || `Cámara ${index + 1}`}
                </TouchButton>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'printer' && (
          <>
            <p>Modo actual: {context.printerMode === 'pdf' ? 'PDF (sin impresora física)' : 'Impresora física'}</p>
            <div className="screen__button-row">
              <TouchButton
                variant={context.printerMode === 'pdf' ? 'primary' : 'secondary'}
                onClick={() => handlePrinterModeChange('pdf')}
              >
                Modo PDF
              </TouchButton>
              <TouchButton
                variant={context.printerMode === 'physical' ? 'primary' : 'secondary'}
                onClick={() => handlePrinterModeChange('physical')}
              >
                Impresora física
              </TouchButton>
            </div>
          </>
        )}
        {activeTab === 'filters' && config && (
          <div className="admin-panel-row">
            <CameraPreview
              deviceId={config.camera.deviceId || undefined}
              lightingWarmth={config.filters.lightingWarmth}
              beautyIntensity={config.filters.beautyIntensity}
            />
            <div className="admin-panel-row__list">
              <label className="admin-slider">
                Corrección de color del filtro "Natural" (frío ↔ cálido): {config.filters.lightingWarmth.toFixed(2)}
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={config.filters.lightingWarmth}
                  onChange={(e) => handleFilterChange({ lightingWarmth: Number(e.target.value) })}
                />
              </label>
              <label className="admin-slider">
                Intensidad de piel/beauty: {config.filters.beautyIntensity.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.filters.beautyIntensity}
                  onChange={(e) => handleFilterChange({ beautyIntensity: Number(e.target.value) })}
                />
              </label>
              <TouchButton
                variant={config.filters.sparklesDefault ? 'primary' : 'secondary'}
                onClick={() => handleFilterChange({ sparklesDefault: !config.filters.sparklesDefault })}
              >
                Sparkles por default: {config.filters.sparklesDefault ? 'Sí' : 'No'} (Fase 6)
              </TouchButton>
            </div>
          </div>
        )}
        {activeTab === 'event' && config && (
          <>
            <p>Tema visual: {config.event.theme === 'dark' ? 'Oscuro' : 'Claro'}</p>
            <div className="screen__button-row">
              <TouchButton
                variant={config.event.theme === 'dark' ? 'primary' : 'secondary'}
                onClick={() => handleThemeChange('dark')}
              >
                Oscuro
              </TouchButton>
              <TouchButton
                variant={config.event.theme === 'light' ? 'primary' : 'secondary'}
                onClick={() => handleThemeChange('light')}
              >
                Claro
              </TouchButton>
            </div>
          </>
        )}
        {activeTab === 'history' && <p>Historial de sesiones (Fase 7).</p>}
      </div>

      <TouchButton variant="secondary" onClick={() => send({ type: 'ADMIN_EXIT' })}>
        Salir
      </TouchButton>
    </div>
  )
}
