import { contextBridge, ipcRenderer } from 'electron'
import type { PhotoBoothConfig } from './store.js'
import type { SaveShotsInput, SaveShotsResult } from './sessionStore.js'
import type { PrintJobInput, PrintResult } from './printService/index.js'

export interface PrinterInfo {
  name: string
  displayName: string
}

const api = {
  config: {
    get: (): Promise<PhotoBoothConfig> => ipcRenderer.invoke('config:get'),
    update: (partial: Partial<PhotoBoothConfig>): Promise<PhotoBoothConfig> =>
      ipcRenderer.invoke('config:update', partial),
  },
  admin: {
    verifyPin: (pin: string): Promise<boolean> => ipcRenderer.invoke('admin:verifyPin', pin),
  },
  session: {
    saveShots: (input: SaveShotsInput): Promise<SaveShotsResult> =>
      ipcRenderer.invoke('session:saveShots', input),
  },
  print: {
    run: (input: PrintJobInput): Promise<PrintResult> => ipcRenderer.invoke('print:run', input),
    listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('print:listPrinters'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  },
  log: {
    info: (message: string): Promise<void> => ipcRenderer.invoke('log:write', 'info', message),
    warn: (message: string): Promise<void> => ipcRenderer.invoke('log:write', 'warn', message),
    error: (message: string): Promise<void> => ipcRenderer.invoke('log:write', 'error', message),
  },
}

export type PhotoBoothApi = typeof api

contextBridge.exposeInMainWorld('photobooth', api)
