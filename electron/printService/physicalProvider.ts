import { BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PrintProvider, PrintLayout, PrintResult } from './index.js'
import {
  CELL_GAP,
  FOOTER_HEIGHT,
  OUTER_MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  STRIP_WIDTH,
} from './pdfProvider.js'

// 4x6" in microns, the unit Electron's print pageSize expects.
const PAGE_SIZE_MICRONS = { width: 101_600, height: 152_400 }
const PRINT_TIMEOUT_MS = 60_000

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * Same 4x6" two-strip page as PdfPrintProvider (all sizes in pt, so the
 * constants are shared), rendered as HTML and sent straight to the OS print
 * driver with a silent print — no dialog, so the kiosk never loses focus.
 */
function buildPageHtml(imageFiles: string[], eventName: string): string {
  const strip = `
    <div class="strip">
      ${imageFiles.map((file) => `<div class="cell"><img src="${file}"></div>`).join('')}
      <div class="footer">${escapeHtml(eventName)}</div>
    </div>`

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${PAGE_WIDTH}pt ${PAGE_HEIGHT}pt; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${PAGE_WIDTH}pt; height: ${PAGE_HEIGHT}pt; background: #fff; overflow: hidden; }
  body { display: flex; }
  .strip {
    width: ${STRIP_WIDTH}pt; height: ${PAGE_HEIGHT}pt; padding: ${OUTER_MARGIN}pt;
    display: flex; flex-direction: column; gap: ${CELL_GAP}pt;
  }
  .cell { flex: 1; min-height: 0; overflow: hidden; }
  .cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .footer {
    height: ${FOOTER_HEIGHT - CELL_GAP}pt; display: flex; align-items: flex-end; justify-content: center;
    font: bold 9pt Helvetica, Arial, sans-serif; color: #333;
  }
</style></head>
<body>${strip}${strip}</body></html>`
}

export class PhysicalPrintProvider implements PrintProvider {
  private readonly printerName: string

  constructor(printerName: string) {
    this.printerName = printerName
  }

  async print(images: Buffer[], layout: PrintLayout): Promise<PrintResult> {
    if (images.length === 0) {
      return { ok: false, error: 'No hay fotos capturadas para imprimir' }
    }
    if (!this.printerName) {
      return { ok: false, error: 'No hay impresora seleccionada. Elige una en Admin > Impresora.' }
    }

    let tmpDir: string | null = null
    let win: BrowserWindow | null = null
    try {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photobooth-print-'))
      const imageFiles = await Promise.all(
        images.map(async (buf, i) => {
          const name = `foto_${i}.png`
          await fs.writeFile(path.join(tmpDir!, name), buf)
          return name
        }),
      )
      const htmlPath = path.join(tmpDir, 'print.html')
      await fs.writeFile(htmlPath, buildPageHtml(imageFiles, layout.eventName), 'utf-8')

      win = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      })

      const printers = await win.webContents.getPrintersAsync()
      if (!printers.some((p) => p.name === this.printerName)) {
        return {
          ok: false,
          error: `La impresora "${this.printerName}" no está disponible. Revisa que esté encendida y conectada.`,
        }
      }

      // loadFile resolves after the load event, i.e. once every <img> is decoded.
      await win.loadFile(htmlPath)

      const printWindow = win
      const error = await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve('La impresora no respondió a tiempo'), PRINT_TIMEOUT_MS)
        printWindow.webContents.print(
          {
            silent: true,
            deviceName: this.printerName,
            printBackground: true,
            color: true,
            landscape: false,
            copies: 1,
            margins: { marginType: 'none' },
            pageSize: PAGE_SIZE_MICRONS,
          },
          (success, failureReason) => {
            clearTimeout(timer)
            resolve(success ? null : failureReason || 'Error de impresora')
          },
        )
      })

      return error ? { ok: false, error } : { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
      if (tmpDir) fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
