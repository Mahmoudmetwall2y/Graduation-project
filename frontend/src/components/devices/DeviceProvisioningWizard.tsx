'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Usb,
  Wifi,
  XCircle,
} from 'lucide-react'
import {
  buildJsonProvisioningPayload,
  buildProvisioningBundle,
  DeviceProvisioningCredentials,
  resolveBootstrapUrl,
} from '../../lib/deviceProvisioning'
import {
  isWebSerialSupported,
  requestSerialPort,
  sendJsonLineCommands,
  toWebSerialErrorMessage,
} from '../../lib/device/webSerial'
import type { SerialResponse } from '../../lib/device/provisioning'
import { maskSecret } from '../../lib/device/provisioning'

type SerialStatus = 'idle' | 'sending' | 'sent' | 'error'
type OnlineStatus = 'idle' | 'checking' | 'online' | 'offline' | 'error'

interface DeviceProvisioningWizardProps {
  credentials: DeviceProvisioningCredentials
  onDone: () => void
  onDeviceRefresh?: () => void
}

function isLikelyHttps(url: string) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return url.startsWith('https://')
  }
}

function formatSerialLog(log: string) {
  return log.trim() || 'Waiting for ESP32 serial output...'
}

function isSensorOnlySerialLine(line: string) {
  return (
    line.includes('AD8232 ECG ->') ||
    line.includes('MAX9814 Mic ->') ||
    (line.includes('signal saturated') && line.includes('wiring issue')) ||
    /^-+$/.test(line.trim())
  )
}

const quickSetupSteps = [
  {
    icon: Wifi,
    title: 'Enter Wi-Fi',
    text: 'Use the same Wi-Fi network that can reach this PC.',
  },
  {
    icon: Usb,
    title: 'Send over USB',
    text: 'Choose the ESP32 serial device when the browser asks.',
  },
  {
    icon: RadioTower,
    title: 'Wait online',
    text: 'The app will poll until the first heartbeat arrives.',
  },
]

export function DeviceProvisioningWizard({
  credentials,
  onDone,
  onDeviceRefresh,
}: DeviceProvisioningWizardProps) {
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [hostOverride, setHostOverride] = useState('')
  const [includeWifiPasswordInQr, setIncludeWifiPasswordInQr] = useState(false)
  const [bootstrapInsecure, setBootstrapInsecure] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrError, setQrError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [serialStatus, setSerialStatus] = useState<SerialStatus>('idle')
  const [serialError, setSerialError] = useState<string | null>(null)
  const [serialLog, setSerialLog] = useState('')
  const [watchingOnline, setWatchingOnline] = useState(false)
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('idle')
  const [onlineMessage, setOnlineMessage] = useState('Device has not checked in yet.')
  const [pollAttempts, setPollAttempts] = useState(0)
  const [bundleCreatedAt] = useState(() => new Date().toISOString())

  const serialSupported = isWebSerialSupported()

  const bootstrapUrl = useMemo(
    () => resolveBootstrapUrl(credentials, hostOverride),
    [credentials, hostOverride]
  )

  const jsonPayload = useMemo(
    () =>
      buildJsonProvisioningPayload({
        credentials,
        bootstrapUrl,
        wifiSsid: wifiSsid.trim() || 'YOUR_WIFI_NAME',
        wifiPassword: wifiPassword || 'YOUR_WIFI_PASSWORD',
        bootstrapInsecure,
      }),
    [bootstrapInsecure, bootstrapUrl, credentials, wifiPassword, wifiSsid]
  )

  const qrBundle = useMemo(
    () =>
      buildProvisioningBundle({
        credentials,
        bootstrapUrl,
        wifiSsid: wifiSsid.trim() || 'YOUR_WIFI_NAME',
        wifiPassword,
        includeWifiPassword: includeWifiPasswordInQr,
        createdAt: bundleCreatedAt,
      }),
    [
      bootstrapUrl,
      bundleCreatedAt,
      credentials,
      includeWifiPasswordInQr,
      wifiPassword,
      wifiSsid,
    ]
  )

  useEffect(() => {
    let cancelled = false

    QRCode.toDataURL(JSON.stringify(qrBundle), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 224,
      color: {
        dark: '#071018',
        light: '#ffffff',
      },
    })
      .then(url => {
        if (!cancelled) {
          setQrDataUrl(url)
          setQrError(null)
        }
      })
      .catch(error => {
        if (!cancelled) {
          setQrError(error instanceof Error ? error.message : 'Failed to generate QR code')
          setQrDataUrl('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [qrBundle])

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }

    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  const checkDeviceOnline = useCallback(async () => {
    setOnlineStatus('checking')

    try {
      const response = await fetch(`/api/devices/${credentials.device_id}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Device status check failed')

      const data = await response.json()
      const device = data.device
      const status = device?.status || 'offline'
      const lastSeen = device?.last_seen_at

      if (status === 'online') {
        setOnlineStatus('online')
        setOnlineMessage('Device is online and sending heartbeats.')
        setWatchingOnline(false)
        onDeviceRefresh?.()
        return
      }

      setOnlineStatus('offline')
      setOnlineMessage(
        lastSeen
          ? `Still waiting. Last heartbeat was ${new Date(lastSeen).toLocaleString()}.`
          : 'Still waiting for the first ESP32 heartbeat.'
      )
    } catch (error) {
      setOnlineStatus('error')
      setOnlineMessage(error instanceof Error ? error.message : 'Could not check device status.')
    }
  }, [credentials.device_id, onDeviceRefresh])

  useEffect(() => {
    if (!watchingOnline) return

    let cancelled = false
    let attempts = 0

    const run = async () => {
      if (cancelled) return
      attempts += 1
      setPollAttempts(attempts)
      await checkDeviceOnline()

      if (attempts >= 18 && !cancelled) {
        setWatchingOnline(false)
        setOnlineStatus(current => (current === 'online' ? current : 'offline'))
      }
    }

    run()
    const interval = window.setInterval(run, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [checkDeviceOnline, watchingOnline])

  const sendViaWebSerial = async () => {
    if (!wifiSsid.trim() || !wifiPassword.trim()) {
      setSerialStatus('error')
      setSerialError('Enter the Wi-Fi SSID and password before auto-provisioning.')
      return
    }

    if (!serialSupported) {
      setSerialStatus('error')
      setSerialError('Web Serial is not available in this browser. Use Chrome or Edge.')
      return
    }

    setSerialStatus('sending')
    setSerialError(null)
    setSerialLog('')

    try {
      const port = await requestSerialPort()
      // Build the actual payload with real credentials (not the preview placeholders)
      const payload = buildJsonProvisioningPayload({
        credentials,
        bootstrapUrl,
        wifiSsid: wifiSsid.trim(),
        wifiPassword: wifiPassword.trim(),
        bootstrapInsecure,
      })
      let provisioningSaved = false

      await sendJsonLineCommands({
        port,
        // provision → status → reboot
        commands: [payload, { cmd: 'status' }, { cmd: 'reboot' }],
        // Extra drain time so the firmware's reboot ACK arrives before port closes
        drainMs: 1500,
        onLine: (line, parsed: SerialResponse | undefined) => {
          if (isSensorOnlySerialLine(line)) return
          // Mask secrets in the serial log
          const safeLine = line
            .replace(credentials.device_secret, maskSecret(credentials.device_secret))
            .replace(wifiPassword, wifiPassword ? '********' : '')
          setSerialLog(current => `${current}${safeLine}\n`)
          // Detect successful save — firmware responds with stage:saved_to_nvs
          if (parsed?.status === 'ok' && parsed.stage === 'saved_to_nvs') {
            provisioningSaved = true
          }
        },
      })

      if (!provisioningSaved) {
        throw new Error(
          'The ESP32 did not confirm that provisioning was saved. ' +
          'Make sure the board is running AscultiCor firmware, then try again.'
        )
      }

      setSerialStatus('sent')
      setWatchingOnline(true)
      setOnlineMessage('Waiting for the ESP32 to reboot, bootstrap, and send a heartbeat.')
    } catch (error) {
      setSerialStatus('error')
      setSerialError(toWebSerialErrorMessage(error))
    }
  }

  // JSON text shown in the manual fallback panel
  const manualJsonText = JSON.stringify(
    buildJsonProvisioningPayload({
      credentials,
      bootstrapUrl,
      wifiSsid: wifiSsid.trim() || 'YOUR_WIFI_NAME',
      wifiPassword: wifiPassword || 'YOUR_WIFI_PASSWORD',
      bootstrapInsecure,
    }),
    null,
    2
  )
  const provisioningPayloadText = JSON.stringify(qrBundle, null, 2)
  const tlsNeedsAttention = isLikelyHttps(bootstrapUrl) && !bootstrapInsecure

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">USB Setup Ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep Arduino Serial Monitor closed, then send Wi-Fi and bootstrap settings directly to the ESP32.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {quickSetupSteps.map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {index + 1}
              </span>
              <step.icon className="h-4 w-4 text-primary" />
              {step.title}
            </div>
            <p className="text-xs text-muted-foreground">{step.text}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            label: 'Scoped Secret',
            value: credentials.provisioning_mode === 'bootstrap_recommended'
              ? 'Per-device bootstrap'
              : 'Legacy MQTT',
            tone: 'text-emerald-400',
          },
          {
            icon: RadioTower,
            label: 'MQTT LAN',
            value: credentials.mqtt_lan_exposure_enabled ? 'Reachable' : 'Host-only',
            tone: credentials.mqtt_lan_exposure_enabled ? 'text-emerald-400' : 'text-amber-300',
          },
          {
            icon: Wifi,
            label: 'Bootstrap',
            value: credentials.bootstrap_requires_host_override ? 'Needs LAN IP' : 'Ready',
            tone: credentials.bootstrap_requires_host_override ? 'text-amber-300' : 'text-emerald-400',
          },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <item.icon className={`h-4 w-4 ${item.tone}`} />
              {item.label}
            </div>
            <p className={`text-sm font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {!credentials.mqtt_lan_exposure_enabled && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">MQTT is not exposed to your LAN yet.</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Restart Docker with <code>MQTT_BIND_ADDRESS=0.0.0.0</code> before the real ESP32 tries to connect from Wi-Fi.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-background/70 p-4">
        <div className="mb-4 flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">1. Network Details</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Wi-Fi SSID
            </span>
            <input
              value={wifiSsid}
              onChange={event => setWifiSsid(event.target.value)}
              placeholder="Lab Wi-Fi"
              className="input-field"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Wi-Fi Password
            </span>
            <input
              value={wifiPassword}
              onChange={event => setWifiPassword(event.target.value)}
              placeholder="Required for secured Wi-Fi"
              type="password"
              className="input-field"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Wi-Fi values stay in this browser and are only used for QR/copy/USB provisioning.
        </p>

        {credentials.bootstrap_requires_host_override && (
          <label className="mt-3 block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              AscultiCor host reachable by ESP32
            </span>
            <input
              value={hostOverride}
              onChange={event => setHostOverride(event.target.value)}
              placeholder="https://YOUR_PC_LAN_IP:8443"
              className="input-field"
            />
            <span className="block text-xs text-muted-foreground">
              The ESP32 cannot use localhost. Paste the LAN URL of this machine; for the current Docker setup, use nginx on port 8443.
            </span>
          </label>
        )}

        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Bootstrap URL sent to ESP32
          </div>
          <code className="block break-all rounded-lg bg-background p-2 text-xs text-foreground">
            {bootstrapUrl}
          </code>
        </div>

        {isLikelyHttps(bootstrapUrl) && (
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={bootstrapInsecure}
              onChange={event => setBootstrapInsecure(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Allow insecure HTTPS bootstrap for local testing. Prefer a CA certificate for production.
            </span>
          </label>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr,240px]">
        <div className="order-2 rounded-2xl border border-border bg-background/70 p-4 lg:order-2">
          <div className="mb-3 flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Optional QR</h3>
          </div>
          <div className="flex min-h-[224px] items-center justify-center rounded-xl bg-white p-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="AscultiCor provisioning QR code" className="h-56 w-56" />
            ) : (
              <div className="text-center text-xs text-slate-500">
                {qrError || 'Generating QR...'}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Treat this QR as sensitive; it includes the one-time device secret.
          </p>
          <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeWifiPasswordInQr}
              onChange={event => setIncludeWifiPasswordInQr(event.target.checked)}
              className="mt-0.5"
            />
            <span>Include Wi-Fi password in QR payload</span>
          </label>
          <button
            type="button"
            onClick={() => copyToClipboard(provisioningPayloadText, 'payload')}
            className="btn-ghost mt-3 w-full justify-center gap-2 text-xs"
          >
            {copiedKey === 'payload' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Copy Payload
          </button>
        </div>

        <div className="order-1 rounded-2xl border border-border bg-background/70 p-4 lg:order-1">
          <div className="mb-3 flex items-center gap-2">
            <Usb className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">2. Send to ESP32 Over USB</h3>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Your ESP32 is connected by USB. Click once, select the serial port, and AscultiCor will send the setup commands.
          </p>

          {!serialSupported && (
            <div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100">
              Web Serial is available in Chrome or Edge on localhost/HTTPS. Use the manual commands below if this browser does not expose USB serial.
            </div>
          )}

          {tlsNeedsAttention && (
            <div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100">
              HTTPS bootstrap needs certificate trust on the ESP32. For local testing only, enable the insecure bootstrap checkbox above.
            </div>
          )}

          <button
            type="button"
            onClick={sendViaWebSerial}
            disabled={serialStatus === 'sending'}
            className="btn-primary w-full justify-center gap-2"
          >
            {serialStatus === 'sending' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Usb className="h-4 w-4" />
            )}
            {serialStatus === 'sending' ? 'Sending to ESP32...' : 'Connect USB & Provision ESP32'}
          </button>

          {serialStatus === 'sent' && (
            <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Device provisioning was sent successfully.</p>
                  <p className="mt-1 text-xs text-emerald-100/80">
                    Sensors are not required to add the ESP32. Connect AD8232/MAX9814 before starting a real recording session.
                  </p>
                </div>
              </div>
              <button type="button" onClick={onDone} className="btn-primary mt-3 w-full justify-center">
                Finish Device Setup
              </button>
            </div>
          )}

          {serialStatus === 'error' && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serialError}</span>
            </div>
          )}

          <div className="mt-3 rounded-xl bg-slate-950 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Serial Log
              </span>
              <button
                type="button"
                onClick={() => setSerialLog('')}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-emerald-300">
              {formatSerialLog(serialLog)}
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">3. Confirm Online</h3>
          </div>
          <button
            type="button"
            onClick={checkDeviceOnline}
            className="btn-ghost gap-2 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            Check Now
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {onlineStatus === 'online'
                ? 'ESP32 online'
                : onlineStatus === 'checking'
                  ? 'Checking device heartbeat'
                  : 'Waiting for ESP32 signal'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {onlineMessage}
              {watchingOnline ? ` Poll ${pollAttempts}/18.` : ''}
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              onlineStatus === 'online'
                ? 'bg-emerald-500/10 text-emerald-300'
                : onlineStatus === 'error'
                  ? 'bg-red-500/10 text-red-300'
                  : 'bg-amber-500/10 text-amber-300'
            }`}
          >
            {onlineStatus === 'checking' && <Loader2 className="h-3 w-3 animate-spin" />}
            {onlineStatus === 'online' && <Check className="h-3 w-3" />}
            {onlineStatus !== 'online' && onlineStatus !== 'checking' && <RadioTower className="h-3 w-3" />}
            {onlineStatus}
          </div>
        </div>
      </section>

      <details className="rounded-2xl border border-border bg-background/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Optional manual Serial Monitor fallback
        </summary>
        <p className="mt-3 text-xs text-muted-foreground">
          Open Arduino IDE Serial Monitor at 115200 baud and paste this JSON line if Web Serial is unavailable.
          The ESP32 will reply with <code>{'{"status":"ok","stage":"saved_to_nvs"}'}</code> on success.
        </p>
        <div className="mt-3 rounded-xl bg-slate-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Terminal className="h-3 w-3" />
              JSON Command
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(manualJsonText, 'commands')}
              className="text-xs text-slate-400 hover:text-white"
            >
              {copiedKey === 'commands' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-emerald-300">
            {manualJsonText}
          </pre>
        </div>
      </details>

      <details className="rounded-2xl border border-border bg-background/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Legacy manual MQTT values
        </summary>
        <p className="mt-3 text-xs text-muted-foreground">
          Use this only if you intentionally bypass bootstrap and store broker credentials directly on the ESP32.
        </p>
        <div className="mt-3 grid gap-2 text-xs">
          {[
            ['org_id', credentials.org_id],
            ['mqtt_host', credentials.mqtt_host],
            ['mqtt_port', String(credentials.mqtt_port)],
            ['mqtt_user', credentials.mqtt_user],
            ['mqtt_pass', credentials.mqtt_pass],
          ].map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
              <code className="w-20 shrink-0 text-muted-foreground">{key}</code>
              <code className="min-w-0 flex-1 break-all text-foreground">{value}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(value, `legacy-${key}`)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {copiedKey === `legacy-${key}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      </details>

      <button type="button" onClick={onDone} className="btn-primary w-full justify-center">
        Done - sensors can be connected later
      </button>
    </div>
  )
}
