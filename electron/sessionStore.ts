import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from './logger.js'
import { decodeDataUrl } from './dataUrl.js'

export interface SaveShotsInput {
  sessionId: string
  mode: 'strip'
  shots: string[]
}

export interface SaveShotsResult {
  ok: boolean
  folder?: string
  error?: string
}

async function writeAtomic(filePath: string, data: Buffer | string): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, data)
  await fs.rename(tmpPath, filePath)
}

// Raw shots land in {outputFolder}/{sessionId}/ before any compositing.
// Fase 3 adds the composited 4x6" PDF next to them; Fase 7's history tab
// reads metadata.json to list past sessions.
export async function saveSessionShots(
  outputFolder: string,
  input: SaveShotsInput,
): Promise<SaveShotsResult> {
  const folder = path.join(outputFolder, input.sessionId)
  try {
    await fs.mkdir(folder, { recursive: true })

    await Promise.all(
      input.shots.map((shot, index) =>
        writeAtomic(path.join(folder, `raw-${index + 1}.png`), decodeDataUrl(shot)),
      ),
    )

    const metadata = {
      sessionId: input.sessionId,
      mode: input.mode,
      shotCount: input.shots.length,
      capturedAt: new Date().toISOString(),
    }
    await writeAtomic(path.join(folder, 'metadata.json'), JSON.stringify(metadata, null, 2))

    return { ok: true, folder }
  } catch (error) {
    logger.error(`Failed to save session ${input.sessionId}: ${error}`)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
