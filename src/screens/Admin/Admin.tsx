import { useEffect, useState } from 'react'
import { TouchButton } from '../../components/TouchButton'
import type { ScreenProps } from '../ScreenProps'
import type { PhotoBoothConfig } from '../../../electron/store'
import type { PrinterInfo } from '../../../electron/preload'
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
  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null)
  const [testStatus, setTestStatus] = useState<string | null>(null)

  const refreshPrinters = () => {
    setPrinters(null)
    window.photobooth.print.listPrinters().then(setPrinters).catch(() => setPrinters([]))
  }

  useEffect(() => {
    if (activeTab === 'printer' && unlocked) refreshPrinters()
  }, [activeTab, unlocked])

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

  const handlePrinterSelect = (printerName: string) => {
    if (!config) return
    window.photobooth.config.update({ printer: { ...config.printer, printerName } }).then(setConfig)
  }

  const handleTestPrint = async () => {
    setTestStatus('Imprimiendo prueba...')
    const result = await window.photobooth.print
      .run({ sessionId: 'prueba', mode: 'strip', shots: makeTestShots(), target: 'physical' })
      .catch(() => ({ ok: false, error: 'Error desconocido' }))
    setTestStatus(result.ok ? 'Prueba enviada a la impresora.' : `Error: ${result.error}`)
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

            <p>Impresora seleccionada: {config?.printer.printerName || 'ninguna'}</p>
            <div className="screen__button-row">
              {printers === null && <p className="screen--idle__hint">Buscando impresoras...</p>}
              {printers?.length === 0 && <p className="screen--idle__hint">No se encontraron impresoras.</p>}
              {printers?.map((printer) => (
                <TouchButton
                  key={printer.name}
                  variant={config?.printer.printerName === printer.name ? 'primary' : 'secondary'}
                  onClick={() => handlePrinterSelect(printer.name)}
                >
                  {printer.displayName || printer.name}
                </TouchButton>
              ))}
            </div>
            <div className="screen__button-row">
              <TouchButton variant="secondary" onClick={refreshPrinters}>
                Actualizar lista
              </TouchButton>
              <TouchButton variant="secondary" onClick={handleTestPrint} disabled={!config?.printer.printerName}>
                Imprimir prueba
              </TouchButton>
            </div>
            {testStatus && <p>{testStatus}</p>}
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
      <TouchButton variant="secondary" onClick={() => window.photobooth.app.quit()}>
        Cerrar aplicación
      </TouchButton>
    </div>
  )
}

/** Placeholder photos for "Imprimir prueba", so the layout can be checked without a session. */
function makeTestShots(): string[] {
  const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653']
  return colors.map((color, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 800
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 120px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`Prueba ${i + 1}`, canvas.width / 2, canvas.height / 2)
    return canvas.toDataURL('image/png')
  })
}
