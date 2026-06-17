import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PROVISION_TIMEOUT_MS = 60_000

function getFlasherUrl() {
  return (process.env.ASCULTICOR_FIRMWARE_FLASHER_URL || 'http://firmware-flasher:8091').replace(/\/+$/, '')
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || 'Device provisioning failed.')
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const response = await fetchWithTimeout(`${getFlasherUrl()}/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    const payload = await response.json().catch(() => null)
    return NextResponse.json(payload || { ok: response.ok }, {
      status: response.ok ? 200 : response.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Provisioning request failed: ${toErrorMessage(error)}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
