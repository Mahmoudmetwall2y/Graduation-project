export type DeploymentMode = 'local' | 'vps'
export type SetupMode = 'new_esp32' | 'already_flashed' | 'manual' | 'simulator'

export interface DeviceProvisioningCredentials {
  device_id: string
  device_secret: string
  org_id: string
  bootstrap_url: string
  bootstrap_requires_host_override: boolean
  provisioning_mode: 'bootstrap_recommended' | 'legacy_manual'
  mqtt_host: string
  mqtt_port: number
  mqtt_tls: boolean
  mqtt_lan_exposure_enabled: boolean
  mqtt_user?: string
  mqtt_pass?: string
  firmware_version?: string
  environment?: DeploymentMode
}

export interface ProvisioningPayload {
  cmd: 'provision'
  device_id: string
  device_secret: string
  bootstrap_url: string
  wifi_ssid: string
  wifi_pass: string
  mqtt_host?: string
  mqtt_port?: number
  mqtt_user?: string
  mqtt_pass?: string
}

export type SerialCommand =
  | ProvisioningPayload
  | { cmd: 'reboot' }
  | { cmd: 'status' }
  | { cmd: 'reset_provisioning' }
  | { cmd: 'preflight' }
  | { cmd: 'test_ecg' }
  | { cmd: 'test_pcg' }

export interface SerialResponse {
  status: 'ok' | 'error'
  stage?: string
  code?: string
  message?: string
  device_id?: string
  firmware_version?: string
  provisioned?: boolean
  wifi?: string
  mqtt?: string
  ip?: string
  mode?: 'real_hardware' | 'simulator'
  ecg?: Record<string, unknown>
  pcg?: Record<string, unknown>
}

export interface DeviceSetupError {
  step: string
  message: string
  code?: string
}

export interface DevicePreflightResult {
  label: string
  status: 'pass' | 'warning' | 'fail' | 'not_tested'
  detail: string
}

const BAD_DEVICE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'frontend',
  'inference',
  'mosquitto',
])

export function maskSecret(value?: string) {
  if (!value) return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase()
  }
}

export function isBadDeviceHost(value: string) {
  const host = hostFromUrl(value)
  if (BAD_DEVICE_HOSTS.has(host)) return true
  // Block Docker bridge range (172.16.0.0/12) — not reachable from ESP32 Wi-Fi
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true
  // 10.x.x.x is a valid private LAN range — do NOT block it
  return false
}

export function buildBootstrapUrl(input: {
  mode: DeploymentMode
  origin: string
  localLanHost: string
  vpsBaseUrl: string
}) {
  if (input.mode === 'vps') {
    const base = stripTrailingSlash(input.vpsBaseUrl || input.origin)
    return `${base}/api/device/bootstrap`
  }

  const browserUrl = new URL(input.origin)
  const lanHost = input.localLanHost.trim()
  if (!lanHost) return `${browserUrl.protocol}//YOUR_LAN_IP:${browserUrl.port || '3000'}/api/device/bootstrap`
  const host = lanHost.includes(':') ? lanHost : `${lanHost}:${browserUrl.port || '3000'}`
  return `${browserUrl.protocol}//${host}/api/device/bootstrap`
}

export function buildProvisioningPayload(input: {
  credentials: DeviceProvisioningCredentials
  bootstrapUrl: string
  wifiSsid: string
  wifiPassword: string
}): ProvisioningPayload {
  return {
    cmd: 'provision',
    device_id: input.credentials.device_id,
    device_secret: input.credentials.device_secret,
    bootstrap_url: input.bootstrapUrl,
    wifi_ssid: input.wifiSsid,
    wifi_pass: input.wifiPassword,
  }
}

export function serializeSerialCommand(command: SerialCommand) {
  return `${JSON.stringify(command)}\n`
}

export function validateProvisioningPayload(payload: ProvisioningPayload) {
  if (!payload.wifi_ssid.trim()) return 'Wi-Fi SSID is required.'
  if (!payload.wifi_pass.trim()) return 'Wi-Fi password is required.'
  if (isBadDeviceHost(payload.bootstrap_url)) {
    return 'The ESP32 cannot use localhost, Docker service names, or private container IPs. Use a LAN IP or public VPS host.'
  }
  return null
}

