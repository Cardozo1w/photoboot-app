import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  type PDFPage,
  type PDFImage,
  type PDFFont,
} from 'pdf-lib'
import type { PrintProvider, PrintLayout, PrintResult } from './index.js'

// Shared with PhysicalPrintProvider so the printed page matches the PDF.
const IN_TO_PT = 72
export const PAGE_WIDTH = 4 * IN_TO_PT
export const PAGE_HEIGHT = 6 * IN_TO_PT
export const STRIP_WIDTH = 2 * IN_TO_PT
export const OUTER_MARGIN = 8
export const CELL_GAP = 6
export const FOOTER_HEIGHT = 26

async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, data)
  await fs.rename(tmpPath, filePath)
}

/**
 * Composes the DNP DS620A's 4x6" two-strip-per-page layout (section 6) and
 * writes it to {outputFolder}/sesion_{timestamp}_{id}.pdf. Fase 9's
 * PhysicalPrintProvider will send the same page to the driver instead of a
 * file — nothing else in the app needs to change when that lands.
 */
export class PdfPrintProvider implements PrintProvider {
  private readonly outputFolder: string

  constructor(outputFolder: string) {
    this.outputFolder = outputFolder
  }

  async print(images: Buffer[], layout: PrintLayout): Promise<PrintResult> {
    if (images.length === 0) {
      return { ok: false, error: 'No hay fotos capturadas para imprimir' }
    }

    try {
      const pdfDoc = await PDFDocument.create()
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const embeddedImages = await Promise.all(images.map((buf) => pdfDoc.embedPng(buf)))

      // The DNP DS620A cuts a 4x6" print into two 2x6" strips — duplicate
      // the same layout on both halves so a guest gets two copies to share.
      for (let stripIndex = 0; stripIndex < 2; stripIndex++) {
        this.drawStrip(page, embeddedImages, stripIndex * STRIP_WIDTH, layout, font)
      }

      const pdfBytes = await pdfDoc.save()

      await fs.mkdir(this.outputFolder, { recursive: true })
      const filename = `sesion_${Date.now()}_${layout.sessionId}.pdf`
      const filePath = path.join(this.outputFolder, filename)
      await writeAtomic(filePath, Buffer.from(pdfBytes))

      return { ok: true, filePath }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private drawStrip(
    page: PDFPage,
    images: PDFImage[],
    stripX: number,
    layout: PrintLayout,
    font: PDFFont,
  ): void {
    const cellWidth = STRIP_WIDTH - OUTER_MARGIN * 2
    const availableHeight = PAGE_HEIGHT - OUTER_MARGIN * 2 - FOOTER_HEIGHT
    const cellCount = images.length
    const cellHeight = (availableHeight - CELL_GAP * (cellCount - 1)) / cellCount

    images.forEach((image, index) => {
      const cellX = stripX + OUTER_MARGIN
      const cellY = PAGE_HEIGHT - OUTER_MARGIN - cellHeight - index * (cellHeight + CELL_GAP)
      this.drawImageCover(page, image, cellX, cellY, cellWidth, cellHeight)
    })

    const footerText = layout.eventName
    const textWidth = font.widthOfTextAtSize(footerText, 9)
    page.drawText(footerText, {
      x: stripX + STRIP_WIDTH / 2 - textWidth / 2,
      y: OUTER_MARGIN,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    })
  }

  /** Scales + clips the image to fill the cell without distorting it. */
  private drawImageCover(
    page: PDFPage,
    image: PDFImage,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const scale = Math.max(w / image.width, h / image.height)
    const drawW = image.width * scale
    const drawH = image.height * scale
    const drawX = x - (drawW - w) / 2
    const drawY = y - (drawH - h) / 2

    page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath())
    page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH })
    page.pushOperators(popGraphicsState())
  }
}
