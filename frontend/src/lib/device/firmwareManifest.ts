export interface FirmwareManifestPart {
  path: string
  offset: number
}

export interface FirmwareManifest {
  name: string
  version: string
  chipFamily: 'ESP32'
  parts: FirmwareManifestPart[]
}

export const ASCULTICOR_FIRMWARE_VERSION = '3.0.0'
export const ASCULTICOR_FIRMWARE_MANIFEST_PATH = '/firmware/manifest.json'

export async function fetchFirmwareManifest(): Promise<FirmwareManifest | null> {
  try {
    const response = await fetch(ASCULTICOR_FIRMWARE_MANIFEST_PATH, { cache: 'no-store' })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

