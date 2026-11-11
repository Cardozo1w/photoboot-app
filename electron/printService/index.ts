import { decodeDataUrl } from '../dataUrl.js'
import { PdfPrintProvider } from './pdfProvider.js'
import { PhysicalPrintProvider } from './physicalProvider.js'

export interface PrintLayout {
  sessionId: string
  mode: 'strip'
  eventName: string
}

export interface PrintResult {
  ok: boolean
  filePath?: string
  error?: string
}

export interface PrintProvider {
  print(images: Buffer[], layout: PrintLayout): Promise<PrintResult>
}

export interface PrintJobInput {
  sessionId: string
  mode: 'strip'
  shots: string[] // data URLs
  /** Overrides printer.mode, e.g. "Guardar como PDF" after a failed print. */
  target?: 'pdf' | 'physical'
}

export interface PrinterSettings {
  mode: 'pdf' | 'physical'
  printerName: string
  outputFolder: string
}

export interface EventSettings {
  name: string
}

/**
 * The rest of the app only ever calls this — it doesn't need to know
 * whether a physical printer is connected (section 6's abstraction layer).
 * Switching printer.mode in Admin is enough to change what happens here.
 */
export async function runPrintJob(
  printer: PrinterSettings,
  event: EventSettings,
  input: PrintJobInput,
): Promise<PrintResult> {
  const target = input.target ?? printer.mode
  const provider: PrintProvider =
    target === 'physical'
      ? new PhysicalPrintProvider(printer.printerName)
      : new PdfPrintProvider(printer.outputFolder)

  const images = input.shots.map(decodeDataUrl)
  return provider.print(images, {
    sessionId: input.sessionId,
    mode: input.mode,
    eventName: event.name,
  })
}
