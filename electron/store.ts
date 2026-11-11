import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export interface PhotoBoothConfig {
  camera: { deviceId: string; resolution: string }
  printer: { mode: 'pdf' | 'physical'; printerName: string; outputFolder: string }
  filters: { beautyIntensity: number; lightingWarmth: number; sparklesDefault: boolean }
  event: { name: string; logoPath: string; frameSetActive: string; theme: 'dark' | 'light' }
  admin: { pinHash: string }
}

const CONFIG_FILENAME = 'config.json'
const DEFAULT_PIN = '1234'

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex')
}

function defaultConfig(): PhotoBoothConfig {
  return {
    camera: { deviceId: '', resolution: '1920x1080' },
    printer: {
      mode: 'pdf',
      printerName: '',
      outputFolder: path.join(app.getPath('documents'), 'PhotoBooth', 'sesiones'),
    },
    // Slightly negative by default to correct the reddish cast common on
    // consumer webcams under indoor lighting (see src/filters/lightingFilter.ts).
    filters: { beautyIntensity: 0.35, lightingWarmth: -0.5, sparklesDefault: false },
    event: { name: 'Photo Booth', logoPath: '', frameSetActive: 'default', theme: 'dark' },
    admin: { pinHash: hashPin(DEFAULT_PIN) },
  }
}

/**
 * Plain JSON-backed config store (no electron-store dependency: that package
 * is ESM-only from v9+ which complicates loading from the CJS-adjacent main
 * bundle). Writes are atomic (temp file + rename) so a power loss mid-save
 * never corrupts config.json.
 */
export class ConfigStore {
  private filePath: string
  private data: PhotoBoothConfig

  private constructor(filePath: string, data: PhotoBoothConfig) {
    this.filePath = filePath
    this.data = data
  }

  static async load(): Promise<ConfigStore> {
    const filePath = path.join(app.getPath('userData'), CONFIG_FILENAME)
    let data: PhotoBoothConfig
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      data = { ...defaultConfig(), ...JSON.parse(raw) }
    } catch {
      data = defaultConfig()
    }
    const store = new ConfigStore(filePath, data)
    await store.save()
    return store
  }

  get(): PhotoBoothConfig {
    return this.data
  }

  async update(partial: Partial<PhotoBoothConfig>): Promise<PhotoBoothConfig> {
    this.data = { ...this.data, ...partial }
    await this.save()
    return this.data
  }

  verifyPin(pin: string): boolean {
    return hashPin(pin) === this.data.admin.pinHash
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const tmpPath = `${this.filePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8')
    await fs.rename(tmpPath, this.filePath)
  }
}
