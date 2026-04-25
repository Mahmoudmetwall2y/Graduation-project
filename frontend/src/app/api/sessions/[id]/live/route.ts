import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  authorizeSessionLiveAccess,
  createServiceRoleClient,
  fetchSessionLivePayload,
} from '@/lib/server/session-live'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const url = new URL(request.url)
    const seed = url.searchParams.get('seed') === '1'
    const cursor = url.searchParams.get('cursor')

    const access = await authorizeSessionLiveAccess(supabase, params.id)
    if (!access.ok) {
      return jsonNoStore({ error: access.error }, access.status)
    }

    const payload = await fetchSessionLivePayload({
      supabase,
      sessionId: params.id,
      orgId: access.access.profile.org_id,
      seed,
      cursor,
      serviceClient: seed ? createServiceRoleClient() : null,
    })

    return jsonNoStore(payload)
  } catch (error) {
    console.error('Error fetching session live route:', error)
    return jsonNoStore({ error: 'Failed to fetch live waveform data' }, 500)
  }
}
