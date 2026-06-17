'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  FlaskConical,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Usb,
  Wifi,
  XCircle,
} from 'lucide-react'
import {
  buildBootstrapUrl,
  buildProvisioningPayload,
  DevicePreflightResult,
  DeviceProvisioningCredentials,
  DeploymentMode,
  isBadDeviceHost,
  maskSecret,
  SetupMode,
  validateProvisioningPayload,
} from '../../lib/device/provisioning'
import { ASCULTICOR_FIRMWARE_MANIFEST_PATH, fetchFirmwareManifest } from '../../lib/device/firmwareManifest'

type WizardStage =
  | 'requirements'
  | 'connect'
  | 'flash'
  | 'wifi'
  | 'register'
  | 'provision'
  | 'online'
  | 'ready'

const stageLabels: Record<WizardStage, string> = {
  requirements: 'Requirements',
  connect: 'Connect ESP32',
  flash: 'Flash firmware',
  wifi: 'Wi-Fi',
  register: 'Register',
  provision: 'Provision',
  online: 'Online',
  ready: 'Ready',
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}`}>
      {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  )
}

function isSensorOnlySerialLine(line: string) {
  return (
    line.includes('AD8232 ECG ->') ||
    line.includes('MAX9814 Mic ->') ||
    (line.includes('signal saturated') && line.includes('wiring issue')) ||
    /^-+$/.test(line.trim())
  )
}

function SetupModeSelector({
  mode,
  setMode,
}: {
  mode: SetupMode
  setMode: (mode: SetupMode) => void
}) {
  const options: Array<{ id: SetupMode; icon: any; title: string; text: string }> = [
    { id: 'new_esp32', icon: Cpu, title: 'New ESP32 setup', text: 'Flash firmware, then provision Wi-Fi and device credentials through the system.' },
    { id: 'already_flashed', icon: Usb, title: 'Already flashed ESP32', text: 'Skip flashing and send provisioning through the system.' },
    { id: 'manual', icon: Terminal, title: 'Manual setup fallback', text: 'Use this only when automated system flashing is unavailable.' },
    { id: 'simulator', icon: FlaskConical, title: 'Simulator / testing mode - not real sensor data.', text: 'Clearly labeled testing path only.' },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => setMode(option.id)}
          className={`rounded-lg border p-4 text-left transition ${mode === option.id ? 'border-cyan-300/70 bg-cyan-300/10' : 'border-[var(--hud-border)] bg-black/20 hover:border-cyan-300/40'}`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <option.icon className="h-4 w-4 text-cyan-300" />
            {option.title}
          </div>
          <p className="mt-2 text-xs text-white/55">{option.text}</p>
        </button>
      ))}
    </div>
  )
}

function DriverHelpPanel() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-4">
      <h3 className="text-sm font-semibold text-amber-100">ESP32 USB / serial access</h3>
      <div className="mt-3 grid gap-2 text-xs text-amber-50/80 md:grid-cols-2">
        <p>Use a USB <strong>data</strong> cable. Charging-only cables will not show up as a serial port.</p>
        <p>Close Arduino IDE, PlatformIO serial monitors, or any app holding the port open.</p>
        <p>For boards without auto-reset, hold <strong>BOOT</strong> while the flash starts, then release.</p>
        <p>If the port appears then disappears, try another cable, a direct USB port, or a powered hub.</p>
        <p className="md:col-span-2 font-semibold text-amber-100">🪟 Windows (Docker Desktop) — USB passthrough required:</p>
        <div className="md:col-span-2 rounded bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-200 space-y-0.5">
          <p>usbipd list</p>
          <p>usbipd bind   --busid &lt;BUS-ID&gt;</p>
          <p>usbipd attach --wsl --busid &lt;BUS-ID&gt;</p>
        </div>
        <p className="md:col-span-2 text-amber-50/65">Install <strong>usbipd-win</strong> from <code>winget install usbipd</code> if needed. After attaching, the ESP32 appears as <code>/dev/ttyUSB0</code> or <code>/dev/ttyACM0</code> inside WSL2 and Docker.</p>
        <p>🐧 Linux: add your user to the <code>dialout</code> group and stop ModemManager from grabbing the port.</p>
        <p>Windows may also need CP210x, CH340, or FTDI drivers from the board vendor for the port to appear in Windows at all.</p>
      </div>
    </section>
  )
}

function LocalVsVpsConnectionHelp({
  deploymentMode,
  setDeploymentMode,
  localLanHost,
  setLocalLanHost,
  vpsBaseUrl,
  setVpsBaseUrl,
  bootstrapUrl,
}: {
  deploymentMode: DeploymentMode
  setDeploymentMode: (mode: DeploymentMode) => void
  localLanHost: string
  setLocalLanHost: (value: string) => void
  vpsBaseUrl: string
  setVpsBaseUrl: (value: string) => void
  bootstrapUrl: string
}) {
  return (
    <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-4">
      <div className="flex flex-wrap gap-2">
        {(['local', 'vps'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => setDeploymentMode(mode)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase ${deploymentMode === mode ? 'bg-cyan-300 text-slate-950' : 'bg-white/5 text-white/70'}`}
          >
            {mode === 'local' ? 'Local LAN' : 'Hostinger VPS'}
          </button>
        ))}
      </div>

      {deploymentMode === 'local' ? (
        <label className="mt-4 block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Host machine LAN IP and optional port</span>
          <input value={localLanHost} onChange={event => setLocalLanHost(event.target.value)} placeholder="192.168.1.10:3000" className="input-field" />
          <span className="block text-xs text-white/50">If you are running locally, do not use localhost for the ESP32. Use your computer&apos;s LAN IP address.</span>
        </label>
      ) : (
        <label className="mt-4 block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Public domain or VPS URL</span>
          <input value={vpsBaseUrl} onChange={event => setVpsBaseUrl(event.target.value)} placeholder="https://asculticor.example.com" className="input-field" />
          <span className="block text-xs text-white/50">If deployed on Hostinger VPS, use the public domain or VPS IP for bootstrap and MQTT settings.</span>
        </label>
      )}

      <div className={`mt-3 rounded-lg border p-3 text-xs ${isBadDeviceHost(bootstrapUrl) ? 'border-red-400/40 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'}`}>
        <div className="font-semibold">Bootstrap URL sent to ESP32</div>
        <code className="mt-1 block break-all">{bootstrapUrl}</code>
      </div>
    </section>
  )
}

function DeviceSetupChecklist({ activeStage, mode }: { activeStage: WizardStage; mode: SetupMode }) {
  const stages: WizardStage[] = mode === 'already_flashed'
    ? ['requirements', 'connect', 'wifi', 'register', 'provision', 'online', 'ready']
    : ['requirements', 'connect', 'flash', 'wifi', 'register', 'provision', 'online', 'ready']
  const activeIndex = stages.indexOf(activeStage)

  return (
    <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-5">
      {stages.map((stage, index) => (
        <div key={stage} className={`rounded-lg border p-3 ${index <= activeIndex ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-[var(--hud-border)] bg-black/20'}`}>
          <div className="text-xs font-semibold text-white">{index + 1}. {stageLabels[stage]}</div>
        </div>
      ))}
    </div>
  )
}

export function DeviceSetupWizard() {
  const [mode, setMode] = useState<SetupMode>('new_esp32')
  const [stage, setStage] = useState<WizardStage>('requirements')
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>((process.env.NEXT_PUBLIC_DEPLOYMENT_MODE as DeploymentMode) || 'local')
  const [origin, setOrigin] = useState('')
  const [localLanHost, setLocalLanHost] = useState(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_DEVICE_BOOTSTRAP_URL?.replace(/\/api\/device\/bootstrap$/, '') || ''
    try {
      return configuredUrl ? new URL(configuredUrl).host : ''
    } catch {
      return ''
    }
  })
  const [vpsBaseUrl, setVpsBaseUrl] = useState(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_DEVICE_BOOTSTRAP_URL?.replace(/\/api\/device\/bootstrap$/, '') || '')
  const [deviceName, setDeviceName] = useState('')
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [credentials, setCredentials] = useState<DeviceProvisioningCredentials | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serialLog, setSerialLog] = useState<string[]>([])
  const [onlineMessage, setOnlineMessage] = useState('Waiting for device registration.')
  const [preflightResults, setPreflightResults] = useState<DevicePreflightResult[]>([])
  const [firmwareFound, setFirmwareFound] = useState<boolean | null>(null)
  const [systemFlasherReady, setSystemFlasherReady] = useState<boolean | null>(null)
  const [flashLog, setFlashLog] = useState<string[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
      setDeviceName(`ESP32 USB ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
    }
    fetchFirmwareManifest().then(manifest => setFirmwareFound(Boolean(manifest)))
    fetch('/api/device/flash', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => setSystemFlasherReady(Boolean(data?.ok)))
      .catch(() => setSystemFlasherReady(false))
  }, [])

  const bootstrapUrl = useMemo(() => buildBootstrapUrl({
    mode: deploymentMode,
    origin: origin || 'http://localhost:3000',
    localLanHost,
    vpsBaseUrl,
  }), [deploymentMode, localLanHost, origin, vpsBaseUrl])

  const registerDevice = useCallback(async () => {
    setBusy(true)
    setError(null)
    setStage('register')
    try {
      const response = await fetch('/api/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: deviceName || 'AscultiCor ESP32', device_type: 'esp32', bootstrap_url: bootstrapUrl }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to register device.')
      setCredentials(data.credentials)
      setStage('provision')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register device.')
    } finally {
      setBusy(false)
    }
  }, [bootstrapUrl, deviceName])

  const flashFirmwareFromSystem = useCallback(async () => {
    setBusy(true)
    setError(null)
    setFlashLog([])
    setStage('flash')
    try {
      const response = await fetch('/api/device/flash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      const attempts = Array.isArray(data.attempts)
        ? data.attempts.map((attempt: any) => `[detect ${attempt.port || 'unknown'}]\n${attempt.output || ''}`)
        : []
      const flashOutput = data.flash?.output ? [`[flash ${data.port || 'auto'}]\n${data.flash.output}`] : []
      setFlashLog([...attempts, ...flashOutput].filter(Boolean).slice(-8))
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'System firmware flash failed.')
      }
      setStage('wifi')
      setOnlineMessage(`Firmware flashed successfully from the Docker flasher service on ${data.port || 'the detected ESP32 port'}. Continue with Wi-Fi and provisioning.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'System firmware flash failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const provision = useCallback(async () => {
    if (!credentials) return
    const payload = buildProvisioningPayload({ credentials, bootstrapUrl, wifiSsid, wifiPassword })
    const validationError = validateProvisioningPayload(payload)
    if (validationError) {
      setError(validationError)
      return
    }

    setBusy(true)
    setError(null)
    setSerialLog([])
    setPreflightResults([])
    try {
      const response = await fetch('/api/device/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
      const data = await response.json()
      const lines = (Array.isArray(data.lines) ? data.lines : Array.isArray(data.attempts) ? data.attempts.flatMap((attempt: any) => attempt.lines || []) : [])
        .map((line: string) => line.replace(credentials.device_secret, maskSecret(credentials.device_secret)).replace(wifiPassword, wifiPassword ? '********' : ''))
        .filter((line: string) => !isSensorOnlySerialLine(line))
      setSerialLog(lines.slice(-80))
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'The ESP32 did not confirm that provisioning was saved. Make sure it is connected by USB and already flashed.')
      }
      setStage('ready')
      setOnlineMessage(`Provisioning saved through the Docker firmware service on ${data.port || 'the detected ESP32 port'}. It may appear offline until Wi-Fi and MQTT heartbeat arrive.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision through the system flasher.')
    } finally {
      setBusy(false)
    }
  }, [bootstrapUrl, credentials, wifiPassword, wifiSsid])

  const checkOnline = useCallback(async () => {
    if (!credentials) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/devices/${credentials.device_id}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Device status check failed.')
      const device = data.device
      if (device?.status === 'online') {
        setStage('ready')
        setOnlineMessage('Device online. Setup is complete. Connect AD8232/MAX9814 sensors before recording, then run the optional sensor check.')
      } else {
        setOnlineMessage('No heartbeat received yet. The device is still added; check Wi-Fi, MQTT host, firewall, and power if you need live recording now.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Device status check failed.')
    } finally {
      setBusy(false)
    }
  }, [credentials])

  const runPreflight = useCallback(async () => {
    if (!credentials) return
    setBusy(true)
    setError(null)
    const results: DevicePreflightResult[] = []
    try {
      const response = await fetch(`/api/devices/${credentials.device_id}`, { cache: 'no-store' })
      const data = await response.json()
      const device = data.device
      const telemetry = data.telemetry?.[0]?.telemetry_json || {}
      results.push({ label: 'ESP32 online', status: device?.status === 'online' ? 'pass' : 'fail', detail: device?.last_seen_at ? `Last heartbeat ${new Date(device.last_seen_at).toLocaleString()}` : 'No heartbeat received.' })
      results.push({ label: 'Firmware version', status: device?.firmware_version ? 'pass' : 'warning', detail: device?.firmware_version || 'Firmware version not reported yet.' })
      results.push({ label: 'Wi-Fi connected', status: device?.signal_strength ? 'pass' : 'warning', detail: device?.signal_strength ? `${device.signal_strength} dBm` : 'RSSI not reported yet.' })
      results.push({ label: 'MQTT connected', status: device?.status === 'online' ? 'pass' : 'fail', detail: 'Inferred from retained status or heartbeat via MQTT.' })
      results.push({ label: 'AD8232 ECG signal', status: telemetry.leads_off === false ? 'pass' : 'not_tested', detail: telemetry.leads_off === false ? 'Lead-off is false in heartbeat.' : 'Run a real recording session to capture full ECG preflight metrics.' })
      results.push({ label: 'MAX9814 PCG signal', status: telemetry.pcg_dropped_buffers === 0 ? 'pass' : 'not_tested', detail: telemetry.pcg_dropped_buffers === 0 ? 'No PCG buffer drops reported.' : 'Run a real recording session to capture PCG preflight metrics.' })
      setPreflightResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preflight check failed.')
    } finally {
      setBusy(false)
    }
  }, [credentials])

  if (mode === 'simulator') {
    return (
      <div className="space-y-5">
        <SetupModeSelector mode={mode} setMode={setMode} />
        <section className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Simulator / testing mode - not real sensor data.</h2>
          <p className="mt-2 text-sm text-amber-50/75">This path is only for UI or workflow testing. It must not be presented as clinical, ECG, or PCG data.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SetupModeSelector mode={mode} setMode={setMode} />
      <DeviceSetupChecklist activeStage={stage} mode={mode} />

      <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill ok={firmwareFound === true} label={firmwareFound ? 'Firmware manifest found' : 'Firmware binaries not found'} />
          <StatusPill ok={systemFlasherReady === true} label={systemFlasherReady ? 'System flasher ready' : 'System flasher unavailable'} />
          <StatusPill ok={!isBadDeviceHost(bootstrapUrl)} label="ESP32 reachable URL check" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-white/5 p-3 text-sm text-white/80">Connect ESP32 by USB.</div>
          {mode === 'new_esp32' && <div className="rounded-lg bg-white/5 p-3 text-sm text-white/80">Flash AscultiCor firmware.</div>}
          <div className="rounded-lg bg-white/5 p-3 text-sm text-white/80">Configure Wi-Fi, register device, and connect to MQTT. Sensor checks are optional until recording.</div>
        </div>
      </section>

      {mode === 'manual' ? (
        <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
          <h2 className="text-lg font-semibold text-white">Manual setup fallback</h2>
          <p className="mt-2 text-sm text-white/60">Firmware binaries not found. Created manifest/build structure only. Use the release manifest when binaries are generated, or upload through Arduino/PlatformIO as a fallback.</p>
          <a className="btn-primary mt-4 gap-2" href={ASCULTICOR_FIRMWARE_MANIFEST_PATH}><Download className="h-4 w-4" />Firmware manifest</a>
          <pre className="mt-4 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-emerald-300">{`{"cmd":"provision","device_id":"...","device_secret":"...","bootstrap_url":"${bootstrapUrl}","wifi_ssid":"...","wifi_pass":"..."}
{"cmd":"status"}
{"cmd":"reboot"}`}</pre>
        </section>
      ) : (
        <>
          {mode === 'new_esp32' && (
            <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
              <div className="flex items-center gap-2">
                <Usb className="h-4 w-4 text-cyan-300" />
                <h2 className="text-lg font-semibold text-white">1. Flash firmware</h2>
              </div>
              <p className="mt-2 text-sm text-white/60">
                Flash the generic AscultiCor firmware first. Wi-Fi, server URL, and device credentials are saved afterward over USB serial, not baked into this firmware binary.
              </p>

              {firmwareFound ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={flashFirmwareFromSystem}
                    disabled={busy || !systemFlasherReady}
                    className="btn-primary gap-2"
                  >
                    {busy && stage === 'flash' ? <Activity className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
                    {busy && stage === 'flash' ? 'Flashing from system...' : 'Flash from system'}
                  </button>
                  <p className="mt-3 text-xs text-white/45">
                    The Docker firmware flasher auto-detects the ESP32 USB serial port and writes the compiled firmware from the shared firmware volume.
                  </p>
                  {systemFlasherReady === false && (
                    <p className="mt-2 text-xs text-amber-100/80">
                      The firmware flasher container is not reachable. Restart the stack so the system flasher service is running.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-500/10 p-4">
                  <p className="text-sm font-semibold text-amber-100">Firmware binaries not ready yet</p>
                  <p className="mt-2 text-xs text-amber-100/80">
                    The flash button requires the compiled <code>.bin</code> files. If you started the
                    system with <code>docker compose up</code>, the <strong>firmware-builder</strong> container
                    compiles them automatically — no Arduino IDE or drivers needed.
                  </p>
                  <div className="mt-3 space-y-1.5 text-xs text-amber-100/75">
                    <p className="font-semibold text-amber-100">Check build progress or trigger a build:</p>
                    <code className="block rounded bg-black/30 px-2 py-1">docker compose logs firmware-builder</code>
                    <p className="font-semibold text-amber-100 pt-1">Force a recompile (e.g. after a firmware update):</p>
                    <code className="block rounded bg-black/30 px-2 py-1">docker volume rm asculticor_firmware_public</code>
                    <code className="block rounded bg-black/30 px-2 py-1">docker compose up firmware-builder</code>
                  </div>
                  <p className="mt-3 text-xs text-amber-100/60">
                    Once the builder finishes, <strong>refresh this page</strong> — the flash button will
                    appear. If you only have the ESP32 already flashed, use{' '}
                    <strong>&quot;Already flashed ESP32&quot;</strong> mode below instead.
                  </p>
                </div>
              )}
            </section>
          )}

          <LocalVsVpsConnectionHelp
            deploymentMode={deploymentMode}
            setDeploymentMode={setDeploymentMode}
            localLanHost={localLanHost}
            setLocalLanHost={setLocalLanHost}
            vpsBaseUrl={vpsBaseUrl}
            setVpsBaseUrl={setVpsBaseUrl}
            bootstrapUrl={bootstrapUrl}
          />

          <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
            <h2 className="text-lg font-semibold text-white">2. Prepare provisioning</h2>
            <p className="mt-2 text-sm text-white/60">
              After flashing, keep the ESP32 connected by USB. Enter the reachable server URL and Wi-Fi details, register the device, then let the system send provisioning to the flashed firmware.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Device name</span>
              <input value={deviceName} onChange={event => setDeviceName(event.target.value)} className="input-field" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Wi-Fi SSID</span>
              <input value={wifiSsid} onChange={event => setWifiSsid(event.target.value)} className="input-field" />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Wi-Fi password</span>
              <input type="password" value={wifiPassword} onChange={event => setWifiPassword(event.target.value)} className="input-field" />
              <span className="block text-xs text-white/45">Wi-Fi password and device secret are not logged; serial output is masked in the UI.</span>
            </label>
          </section>

          <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={registerDevice} disabled={busy || !deviceName.trim()} className="btn-primary gap-2">
                {busy && stage === 'register' ? <Activity className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                3. Register device
              </button>
              <button type="button" onClick={provision} disabled={busy || !credentials || !wifiSsid || !wifiPassword} className="btn-secondary gap-2">
                <Usb className="h-4 w-4" />
                4. Provision from system
              </button>
              <button type="button" onClick={checkOnline} disabled={busy || !credentials} className="btn-ghost gap-2">
                <RadioTower className="h-4 w-4" />
                Optional heartbeat check
              </button>
            </div>

            {credentials && (
              <div className="mt-4 grid gap-2 text-xs text-white/70 md:grid-cols-2">
                <div className="rounded-lg bg-white/5 p-3">Device ID: <code>{credentials.device_id}</code></div>
                <div className="rounded-lg bg-white/5 p-3">Device secret: <code>{maskSecret(credentials.device_secret)}</code></div>
                <div className="rounded-lg bg-white/5 p-3">MQTT: <code>{credentials.mqtt_host}:{credentials.mqtt_port}</code></div>
                <div className="rounded-lg bg-white/5 p-3">Environment: <code>{deploymentMode}</code></div>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
                <XCircle className="mt-0.5 h-4 w-4" />
                {error}
              </div>
            )}
            <p className="mt-4 text-sm text-white/60">{onlineMessage}</p>
          </section>

          {credentials && (
            <details className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Sensor diagnostics after wiring AD8232/MAX9814
              </summary>
              <p className="mt-2 text-xs text-white/55">
                Skip this while only the ESP32 USB cable is connected. Use it after wiring the ECG and microphone sensors, before recording real signals.
              </p>
              <button type="button" onClick={runPreflight} disabled={busy} className="btn-ghost mt-4 gap-2">
                <RefreshCw className="h-4 w-4" />
                Run sensor diagnostics
              </button>
            </details>
          )}

          {serialLog.length > 0 && (
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-300">{serialLog.join('\n')}</pre>
          )}

          {flashLog.length > 0 && (
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-cyan-100">{flashLog.join('\n\n')}</pre>
          )}

          {preflightResults.length > 0 && (
            <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-5">
              <h2 className="text-lg font-semibold text-white">Optional ECG/PCG sensor check</h2>
              <p className="mt-1 text-xs text-white/55">This is only needed before real recording. It can fail when AD8232/MAX9814 sensors are not connected, but that does not undo device provisioning.</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {preflightResults.map(result => (
                  <div key={result.label} className="rounded-lg border border-[var(--hud-border)] bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{result.label}</span>
                      <span className={`text-xs font-bold uppercase ${result.status === 'pass' ? 'text-emerald-300' : result.status === 'fail' ? 'text-red-300' : 'text-amber-200'}`}>{result.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/55">{result.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stage === 'ready' && (
            <section className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-5">
              <div className="flex items-center gap-2 text-emerald-100">
                <CheckCircle2 className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Device added successfully.</h2>
              </div>
              <p className="mt-2 text-sm text-emerald-100/75">Connect the AD8232 ECG module and MAX9814 microphone before starting a real recording session.</p>
              {credentials && <Link href={`/devices/${credentials.device_id}`} className="btn-primary mt-4">Open device</Link>}
            </section>
          )}
        </>
      )}

      <DriverHelpPanel />
    </div>
  )
}
