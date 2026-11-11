import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

let logFilePath: string | null = null
let writeQueue: Promise<void> = Promise.resolve()

function resolveLogFilePath(): string {
  if (!logFilePath) {
    const date = new Date().toISOString().slice(0, 10)
    logFilePath = path.join(app.getPath('userData'), 'logs', `${date}.log`)
  }
  return logFilePath
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
  // eslint-disable-next-line no-console
  console[level === 'ERROR' ? 'error' : 'log'](line.trim())
  const filePath = resolveLogFilePath()
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.appendFile(filePath, line, 'utf-8')
    })
    .catch(() => {
      // Logging must never crash the app.
    })
}

export const logger = {
  info: (message: string) => write('INFO', message),
  warn: (message: string) => write('WARN', message),
  error: (message: string) => write('ERROR', message),
}
