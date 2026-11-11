import type { PrintProvider, PrintLayout, PrintResult } from './index.js'

/**
 * Placeholder until the DNP DS620A is connected. Fase 9 fills this in:
 * send the composed page to the OS print driver (or a library like
 * node-printer) using the same layout PdfPrintProvider produces, so
 * switching the Admin "Modo PDF" toggle to "Impresora física" is a
 * one-line change everywhere else in the app.
 */
export class PhysicalPrintProvider implements PrintProvider {
  private readonly printerName: string

  constructor(printerName: string) {
    this.printerName = printerName
  }

  async print(_images: Buffer[], _layout: PrintLayout): Promise<PrintResult> {
    return {
      ok: false,
      error: `No physical printer configured yet (Fase 9) — requested printer: ${this.printerName}`,
    }
  }
}
