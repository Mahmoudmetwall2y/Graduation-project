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
  mqtt_user: string
  mqtt_pass: string
}

export interface ProvisioningBundle {
  type: 'asculticor-provision-v1'
  device_id: string
  device_secret: string
  bootstrap_url: string
  wifi_ssid: string
  wifi_pass?: string
  created_at: string
}

export function applyHostOverride(url: string, hostOverride: string) {
  const rawOverride = hostOverride.trim()

  try {
    if (/^https?:\/\//i.test(rawOverride)) {
      const overrideUrl = new URL(rawOverride)
      if (!overrideUrl.pathname || overrideUrl.pathname === '/') {
        overrideUrl.pathname = '/api/device/bootstrap'
      }
      return overrideUrl.toString()
    }

    const parsed = new URL(url)
    const host = rawOverride.replace(/\/.*$/, '')

    if (!host) {
      parsed.hostname = 'YOUR_SERVER_IP'
      return parsed.toString()
    }

    parsed.host = host
    return parsed.toString()
  } catch {
    return rawOverride
      ? `http://${rawOverride.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}/api/device/bootstrap`
      : 'http://YOUR_SERVER_IP/api/device/bootstrap'
  }
}

export function resolveBootstrapUrl(
  credentials: DeviceProvisioningCredentials,
  hostOverride: string
) {
  if (!credentials.bootstrap_requires_host_override) {
    return credentials.bootstrap_url
  }

  return applyHostOverride(credentials.bootstrap_url, hostOverride)
}

export function buildProvisioningBundle(input: {
  credentials: DeviceProvisioningCredentials
  bootstrapUrl: string
  wifiSsid: string
  wifiPassword: string
  includeWifiPassword: boolean
  createdAt?: string
}): ProvisioningBundle {
  return {
    type: 'asculticor-provision-v1',
    device_id: input.credentials.device_id,
    device_secret: input.credentials.device_secret,
    bootstrap_url: input.bootstrapUrl,
    wifi_ssid: input.wifiSsid,
    ...(input.includeWifiPassword && input.wifiPassword
      ? { wifi_pass: input.wifiPassword }
      : {}),
    created_at: input.createdAt || new Date().toISOString(),
  }
}

export function buildSerialProvisioningCommands(input: {
  credentials: DeviceProvisioningCredentials
  bootstrapUrl: string
  wifiSsid: string
  wifiPassword: string
  bootstrapInsecure: boolean
}) {
  const commands = [
    `SET device_id ${input.credentials.device_id}`,
    `SET device_secret ${input.credentials.device_secret}`,
    `SET bootstrap_url ${input.bootstrapUrl}`,
  ]

  if (input.bootstrapInsecure) {
    commands.push('SET bootstrap_insecure true')
  }

  commands.push(
    `SET wifi_ssid ${input.wifiSsid}`,
    `SET wifi_pass ${input.wifiPassword}`,
    'REBOOT'
  )

  return commands
}
