import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  authorizeSessionLiveAccess,
  createServiceRoleClient,
  fetchSessionLivePayload,
} from '@/lib/server/session-live'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STREAM_POLL_MS = 80
const KEEPALIVE_MS = 15000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function encodeSse(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const access = await authorizeSessionLiveAccess(supabase, params.id)

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const encoder = new TextEncoder()
    const serviceClient = createServiceRoleClient()
    let closed = false

    request.signal.addEventListener('abort', () => {
      closed = true
    })

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor: string | null = null
        let lastSessionStatus = access.access.session.status
        let lastKeepaliveAt = Date.now()

        const send = (event: string, payload: unknown) => {
          if (closed) return
          controller.enqueue(encoder.encode(encodeSse(event, payload)))
        }

        try {
          const seedPayload = await fetchSessionLivePayload({
            supabase,
            sessionId: params.id,
            orgId: access.access.profile.org_id,
            seed: true,
            cursor: null,
            serviceClient,
          })

          cursor = seedPayload.cursor
          lastSessionStatus = seedPayload.sessionStatus
          send('frames', seedPayload)

          while (!closed) {
            await sleep(STREAM_POLL_MS)
            if (closed) break

            const payload = await fetchSessionLivePayload({
              supabase,
              sessionId: params.id,
              orgId: access.access.profile.org_id,
              seed: false,
              cursor,
              serviceClient: null,
            })

            const hasFrames = payload.frames.length > 0
            const statusChanged = payload.sessionStatus !== lastSessionStatus
            if (hasFrames || statusChanged) {
              cursor = payload.cursor || cursor
              lastSessionStatus = payload.sessionStatus
              send('frames', payload)
            } else if (Date.now() - lastKeepaliveAt >= KEEPALIVE_MS) {
              lastKeepaliveAt = Date.now()
              send('keepalive', {
                sessionStatus: payload.sessionStatus,
                lastLiveAt: payload.lastLiveAt,
              })
            }

            if (
              (payload.sessionStatus === 'done' || payload.sessionStatus === 'error') &&
              !hasFrames
            ) {
              send('terminal', {
                sessionStatus: payload.sessionStatus,
                lastLiveAt: payload.lastLiveAt,
              })
              break
            }
          }
        } catch (error) {
          console.error('Error streaming session waveform SSE:', error)
          send('error', {
            error: 'Failed to stream live waveform data',
          })
        } finally {
          closed = true
          controller.close()
        }
      },
      cancel() {
        closed = true
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('Error creating session waveform SSE stream:', error)
    return NextResponse.json({ error: 'Failed to create waveform stream' }, { status: 500 })
  }
}
