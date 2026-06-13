import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!UUID_RE.test(params.id)) {
      return jsonNoStore({ error: 'Invalid session id' }, 400)
    }

    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return jsonNoStore({ error: 'Unauthorized' }, 401)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return jsonNoStore({ error: 'Profile not found' }, 404)
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, patient:patients(id, full_name, email, mrn, dob, sex), device:devices(id, device_name)')
      .eq('id', params.id)
      .eq('org_id', profile.org_id)
      .single()

    if (sessionError || !session) {
      return jsonNoStore({ error: 'Session not found' }, 404)
    }

    const [
      { data: settingsData },
      { data: predictions, error: predictionsError },
      { data: notes, error: notesError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      supabase
        .from('org_settings')
        .select('deidentify_exports')
        .eq('org_id', profile.org_id)
        .maybeSingle(),
      supabase
        .from('predictions')
        .select('*')
        .eq('session_id', params.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('session_notes')
        .select('id, note, created_at, author_id')
        .eq('session_id', params.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('audit_logs')
        .select('id, action, metadata, created_at')
        .eq('entity_type', 'session')
        .eq('entity_id', params.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (predictionsError) throw predictionsError
    if (notesError) throw notesError
    if (eventsError) throw eventsError

    return jsonNoStore({
      session,
      predictions: predictions || [],
      notes: notes || [],
      events: events || [],
      deidentifyExports: Boolean(settingsData?.deidentify_exports),
    })
  } catch (error) {
    console.error('Error fetching session summary route:', error)
    return jsonNoStore({ error: 'Failed to fetch session summary' }, 500)
  }
}
