import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigStore } from './store.js'
import { logger } from './logger.js'
import { saveSessionShots, type SaveShotsInput } from './sessionStore.js'
import { runPrintJob, type PrintJobInput } from './printService/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Set PHOTOBOOTH_KIOSK=false during development to get a normal window
// with devtools instead of a locked-down fullscreen kiosk window.
const KIOSK_MODE = process.env.PHOTOBOOTH_KIOSK !== 'false'

let mainWindow: BrowserWindow | null = null
let configStore: ConfigStore

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: true,
    kiosk: KIOSK_MODE,
    frame: !KIOSK_MODE,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  // Block the keyboard escape hatches a kiosk booth should never expose:
  // alt+F4/tab, ctrl+w/q/r, the Windows key, F11, and Escape (which would
  // otherwise drop Electron out of kiosk mode).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!KIOSK_MODE || input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const blocked =
      (input.alt && (key === 'f4' || key === 'tab')) ||
      (input.control && (key === 'w' || key === 'q' || key === 'r')) ||
      key === 'meta' ||
      key === 'f11' ||
      key === 'escape'
    if (blocked) event.preventDefault()
  })

  mainWindow.webContents.on('context-menu', (event) => {
    if (KIOSK_MODE) event.preventDefault()
  })

  mainWindow.on('unresponsive', () => {
    logger.error('BrowserWindow became unresponsive')
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: ${details.reason}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('config:get', () => configStore.get())

  ipcMain.handle('config:update', async (_event, partial) => {
    const updated = await configStore.update(partial)
    logger.info(`Config updated: ${JSON.stringify(Object.keys(partial))}`)
    return updated
  })

  ipcMain.handle('admin:verifyPin', (_event, pin: string) => configStore.verifyPin(pin))

  ipcMain.handle('session:saveShots', (_event, input: SaveShotsInput) =>
    saveSessionShots(configStore.get().printer.outputFolder, input),
  )

  ipcMain.handle('print:run', async (_event, input: PrintJobInput) => {
    const config = configStore.get()
    const result = await runPrintJob(config.printer, config.event, input)
    if (!result.ok) {
      logger.error(`Print job failed for session ${input.sessionId}: ${result.error}`)
    } else if (result.filePath && !KIOSK_MODE) {
      // Dev convenience: pop the generated strip open immediately so you
      // can see the result without digging through the output folder.
      // Skipped in kiosk mode — a PDF viewer stealing focus would break
      // the booth for guests.
      shell.openPath(result.filePath).catch(() => {})
    }
    return result
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('log:write', (_event, level: 'info' | 'warn' | 'error', message: string) => {
    logger[level](`[renderer] ${message}`)
  })
}

app.whenReady().then(async () => {
  configStore = await ConfigStore.load()
  registerIpcHandlers()
  logger.info('App ready, creating main window')
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.stack ?? error.message}`)
})
