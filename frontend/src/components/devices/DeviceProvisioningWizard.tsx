'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Loader2, QrCode, RadioTower, RefreshCw, Wifi } from 'lucide-react'
import type { DeviceProvisioningCredentials } from '../../lib/deviceProvisioning'
import { resolveBootstrapUrl } from '../../lib/deviceProvisioning'

interface DeviceProvisioningWizardProps {
  credentials: DeviceProvisioningCredentials
  onDone: () => void
  onDeviceRefresh?: () => void
}

export function DeviceProvisioningWizard({
  credentials,
  onDone,
  onDeviceRefresh,
}: DeviceProvisioningWizardProps) {
  const [hostOverride, setHostOverride] = useState('')
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [bootstrapInsecure, setBootstrapInsecure] = useState(true)
  const [copied, setCopied] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [online, setOnline] = useState(false)
  const [message, setMessage] = useState('Waiting for the device to connect.')

  const bootstrapUrl = useMemo(
    () => resolveBootstrapUrl(credentials, hostOverride),
    [credentials, hostOverride]
  )

  const setupPayload = useMemo(() => ({
    type: 'asculticor-provision-v2',
    device_id: credentials.device_id,
    device_secret: credentials.device_secret,
    bootstrap_url: bootstrapUrl,
    wifi_ssid: wifiSsid.trim(),
    wifi_pass: wifiPassword,
    bootstrap_insecure: bootstrapInsecure,
    created_at: new Date().toISOString(),
  }), [
    bootstrapInsecure,
    bootstrapUrl,
    credentials.device_id,
    credentials.device_secret,
    wifiPassword,
    wifiSsid,
  ])

  const setupUrl = useMemo(
    () => `http://192.168.4.1/provision?payload=${encodeURIComponent(JSON.stringify(setupPayload))}`,
    [setupPayload]
  )

  useEffect(() => {
    QRCode.toDataURL(setupUrl, {
      width: 224,
      margin: 2,
      errorCorrectionLevel: 'M',
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [setupUrl])

  const copy = useCallback(async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }, [])

  const checkOnline = useCallback(async () => {
    setChecking(true)
    try {
      const response = await fetch(`/api/devices/${credentials.device_id}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Device status check failed')
      const body = await response.json()
      const isOnline = body.device?.status === 'online'
      setOnline(isOnline)
      setMessage(isOnline
        ? `Connected successfully. Firmware ${body.device?.firmware_version || 'version pending'}.`
        : 'The device has not checked in yet. Complete its Wi-Fi setup and try again.')
      if (isOnline) onDeviceRefresh?.()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not check the device.')
    } finally {
      setChecking(false)
    }
  }, [credentials.device_id, onDeviceRefresh])

  useEffect(() => {
    const interval = window.setInterval(checkOnline, 5000)
    return () => window.clearInterval(interval)
  }, [checkOnline])

  const fields = [
    ['Device ID', credentials.device_id],
    ['Device secret', credentials.device_secret],
    ['Bootstrap URL', bootstrapUrl],
  ]

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Wifi className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Wi-Fi Device Onboarding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No server-side USB flasher is required. Power the ESP32 and configure it through its temporary setup network.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['1', 'Power the device', 'The bootstrap firmware starts a temporary AscultiCor setup network.'],
          ['2', 'Join setup Wi-Fi', 'Connect your phone to AscultiCor-Setup-XXXX.'],
          ['3', 'Scan this QR', 'Use your phone camera. It opens the ESP32 local setup URL and saves the credentials.'],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{number}</span>
              {title}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      {credentials.bootstrap_requires_host_override && (
        <label className="block rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
          <span className="text-sm font-semibold text-foreground">Server URL reachable by the ESP32</span>
          <input
            value={hostOverride}
            onChange={event => setHostOverride(event.target.value)}
            placeholder="https://asculticor.example.com"
            className="input-field mt-2"
          />
          <span className="mt-2 block text-xs text-muted-foreground">
            The device cannot use localhost. Use the public AscultiCor URL or a LAN-reachable address.
          </span>
        </label>
      )}

      <section className="rounded-2xl border border-border bg-background/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Real Wi-Fi credentials for the ESP32</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wi-Fi SSID</span>
            <input
              value={wifiSsid}
              onChange={event => setWifiSsid(event.target.value)}
              placeholder="Clinic / Lab Wi-Fi"
              className="input-field"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wi-Fi Password</span>
            <input
              value={wifiPassword}
              onChange={event => setWifiPassword(event.target.value)}
              placeholder="Wi-Fi password"
              type="password"
              className="input-field"
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={bootstrapInsecure}
            onChange={event => setBootstrapInsecure(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Allow insecure HTTPS bootstrap on the ESP32. This makes setup work without installing a CA certificate first;
            replace it with CA trust before real production use.
          </span>
        </label>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr,250px]">
        <section className="rounded-2xl border border-border bg-background/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Credentials included in the QR</h3>
          <div className="space-y-2">
            {[
              ...fields,
              ['Wi-Fi SSID', wifiSsid || 'Not entered yet'],
              ['Wi-Fi password', wifiPassword ? 'Included in QR' : 'Not entered yet'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                  <button type="button" onClick={() => copy(value, label)} className="text-muted-foreground hover:text-foreground">
                    {copied === label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <code className="block break-all text-xs text-foreground">{value}</code>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Join the ESP32 setup Wi-Fi first, then scan the QR with your phone camera.
            It opens <code>http://192.168.4.1/provision</code> and the ESP32 saves these values.
          </p>
          <button
            type="button"
            onClick={() => copy(setupUrl, 'setup-url')}
            className="btn-ghost mt-3 w-full justify-center gap-2 text-xs"
          >
            {copied === 'setup-url' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Copy ESP32 setup URL
          </button>
        </section>

        <section className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Setup QR</h3>
          </div>
          <div className="flex min-h-52 items-center justify-center rounded-xl bg-white p-3">
            {qrDataUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qrDataUrl} alt="AscultiCor setup payload" className="h-52 w-52" />
              : <Loader2 className="h-6 w-6 animate-spin text-slate-500" />}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sensitive: this QR contains the device secret and Wi-Fi password.
          </p>
        </section>
      </div>

      <section className={`rounded-2xl border p-4 ${online ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-border bg-muted/30'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <RadioTower className={`mt-0.5 h-5 w-5 ${online ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div>
              <p className="font-semibold text-foreground">{online ? 'ESP32 online' : 'Waiting for device'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{message}</p>
            </div>
          </div>
          <button type="button" onClick={checkOnline} disabled={checking} className="btn-ghost gap-2">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check now
          </button>
        </div>
      </section>

      <button type="button" onClick={onDone} className="btn-primary w-full justify-center">
        {online ? 'Finish onboarding' : 'Close and finish later'}
      </button>
    </div>
  )
}
