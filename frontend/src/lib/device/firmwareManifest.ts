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

function resolveFirmwarePartPath(path: string) {
  return path.startsWith('/') ? path : `/firmware/${path}`
}

export async function fetchFirmwareManifest(): Promise<FirmwareManifest | null> {
  try {
    const response = await fetch(ASCULTICOR_FIRMWARE_MANIFEST_PATH, { cache: 'no-store' })
    if (!response.ok) return null
    const manifest = (await response.json()) as FirmwareManifest
    if (!Array.isArray(manifest.parts) || manifest.parts.length === 0) return null

    const partChecks = await Promise.all(
      manifest.parts.map(part =>
        fetch(resolveFirmwarePartPath(part.path), {
          cache: 'no-store',
          method: 'HEAD',
          redirect: 'manual',
        })
      )
    )

    if (partChecks.some(partResponse => !partResponse.ok)) return null
    return manifest
  } catch {
    return null
  }
}
