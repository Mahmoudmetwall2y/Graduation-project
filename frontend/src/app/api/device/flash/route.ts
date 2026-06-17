import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FLASH_TIMEOUT_MS = 270_000

function getFlasherUrl() {
  return (process.env.ASCULTICOR_FIRMWARE_FLASHER_URL || 'http://firmware-flasher:8091').replace(/\/+$/, '')
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || 'Firmware flash failed.')
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FLASH_TIMEOUT_MS)
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

export async function GET() {
  try {
    const response = await fetchWithTimeout(`${getFlasherUrl()}/health`, {
      method: 'GET',
    })
    const body = await response.json().catch(() => null)
    return NextResponse.json(body || { ok: response.ok }, {
      status: response.ok ? 200 : response.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Firmware flasher is unavailable: ${toErrorMessage(error)}` },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const response = await fetchWithTimeout(`${getFlasherUrl()}/flash`, {
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
      { ok: false, error: `Firmware flash request failed: ${toErrorMessage(error)}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
