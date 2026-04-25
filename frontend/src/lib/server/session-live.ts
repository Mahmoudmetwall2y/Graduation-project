import { createClient } from '@supabase/supabase-js'

const PREVIEW_DURATIONS: Record<'ecg' | 'pcg', number> = {
  ecg: 6,
  pcg: 3,
}

export interface SessionLiveAccess {
  profile: {
    org_id: string
  }
  session: {
    id: string
    org_id: string
    status: string
  }
}

export interface RecordingPreviewRow {
  modality: 'ecg' | 'pcg'
  sample_rate_hz: number
  storage_path: string
  created_at: string
}

export interface WaveformFrameRow {
  created_at: string
  waveform: {
    modality: 'ecg' | 'pcg'
    sample_rate: number
    sample_start_index: number
    sample_count: number
    sequence: number
    samples: number[]
  }
}

export interface SessionLivePayload {
  frames: WaveformFrameRow[]
  cursor: string | null
  lastLiveAt: string | null
  sessionStatus: string
}

function parsePcm16Recording(buffer: ArrayBuffer) {
  return Array.from(new Int16Array(buffer)).map((value) => value / 32768)
}

function parseWavPcm16(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  let offset = 12

  while (offset + 8 <= view.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    )
    const chunkSize = view.getUint32(offset + 4, true)

    if (chunkId === 'data') {
      const dataStart = offset + 8
      const dataEnd = Math.min(view.byteLength, dataStart + chunkSize)
      const samples: number[] = []
      for (let cursor = dataStart; cursor + 1 < dataEnd; cursor += 2) {
        samples.push(view.getInt16(cursor, true) / 32768)
      }
      return samples
    }

    offset += 8 + chunkSize + (chunkSize % 2)
  }

  return []
}

async function buildRecordingPreviewFrames(
  sessionId: string,
  existingModalities: Set<string>,
  serviceClient: any
) {
  const { data: recordings, error } = await serviceClient
    .from('recordings')
    .select('modality, sample_rate_hz, storage_path, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error || !recordings?.length) {
    if (error) {
      console.error('Error fetching recording previews:', error)
    }
    return []
  }

  const latestByModality = new Map<string, RecordingPreviewRow>()
  for (const recording of (recordings || []) as RecordingPreviewRow[]) {
    latestByModality.set(recording.modality, recording)
  }

  const previews: WaveformFrameRow[] = []
  for (const modality of ['ecg', 'pcg'] as const) {
    if (existingModalities.has(modality)) continue
    const recording = latestByModality.get(modality)
    if (!recording?.storage_path || !recording.sample_rate_hz) continue

    const { data: blob, error: downloadError } = await serviceClient
      .storage
      .from('recordings')
      .download(recording.storage_path)

    if (downloadError || !blob) {
      console.error('Error downloading recording preview:', downloadError)
      continue
    }

    const arrayBuffer = await blob.arrayBuffer()
    const samples = modality === 'pcg'
      ? parseWavPcm16(arrayBuffer)
      : parsePcm16Recording(arrayBuffer)
    if (!samples.length) continue

    const sampleRate = Number(recording.sample_rate_hz)
    const previewCount = Math.max(1, Math.round(sampleRate * PREVIEW_DURATIONS[modality]))
    const previewSamples = samples.slice(-previewCount)
    const sampleStartIndex = Math.max(0, samples.length - previewSamples.length)

    previews.push({
      created_at: recording.created_at,
      waveform: {
        modality,
        sample_rate: sampleRate,
        sample_start_index: sampleStartIndex,
        sample_count: previewSamples.length,
        sequence: 1,
        samples: previewSamples,
      },
    })
  }

  return previews
}

export function createServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

export async function authorizeSessionLiveAccess(
  supabase: any,
  sessionId: string
): Promise<
  | { ok: true; access: SessionLiveAccess }
  | { ok: false; status: number; error: string }
> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { ok: false, status: 404, error: 'Profile not found' }
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, org_id, status')
    .eq('id', sessionId)
    .eq('org_id', profile.org_id)
    .single()

  if (sessionError || !session) {
    return { ok: false, status: 404, error: 'Session not found' }
  }

  return {
    ok: true,
    access: {
      profile,
      session,
    },
  }
}

export async function fetchSessionLivePayload(options: {
  supabase: any
  sessionId: string
  orgId: string
  seed?: boolean
  cursor?: string | null
  serviceClient?: any
}): Promise<SessionLivePayload> {
  const {
    supabase,
    sessionId,
    orgId,
    seed = false,
    cursor = null,
    serviceClient = null,
  } = options

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, org_id, status')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .single()

  if (sessionError || !session) {
    throw sessionError || new Error('Session not found')
  }

  const sessionIsActive =
    session.status === 'streaming' || session.status === 'processing'

  if (seed && serviceClient && !sessionIsActive) {
    const previewFrames = await buildRecordingPreviewFrames(sessionId, new Set(), serviceClient)
    if (previewFrames.length) {
      const lastFrame = previewFrames[previewFrames.length - 1]
      return {
        frames: previewFrames,
        cursor: lastFrame?.created_at || null,
        lastLiveAt: lastFrame?.created_at || null,
        sessionStatus: session.status,
      }
    }
  }

  let query = supabase
    .from('live_metrics')
    .select('created_at, waveform:metrics_json->waveform')
    .eq('session_id', sessionId)

  if (seed || !cursor) {
    query = query.order('created_at', { ascending: false }).limit(40)
  } else {
    query = query
      .gt('created_at', cursor)
      .order('created_at', { ascending: true })
      .limit(24)
  }

  const { data, error } = await query
  if (error) throw error

  const orderedRows = (seed || !cursor ? [...(data || [])].reverse() : (data || [])) as WaveformFrameRow[]
  const frames: WaveformFrameRow[] = orderedRows
    .filter((row) => row?.waveform?.samples?.length && row.waveform.sample_rate)
    .map((row) => ({
      created_at: row.created_at,
      waveform: row.waveform,
    }))

  if (seed && serviceClient) {
    const existingModalities = new Set(frames.map((frame) => frame.waveform.modality))
    const previewFrames = await buildRecordingPreviewFrames(sessionId, existingModalities, serviceClient)
    frames.push(...previewFrames)
    frames.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  const lastFrame = frames[frames.length - 1]
  const nextCursor = lastFrame?.created_at || cursor || null

  return {
    frames,
    cursor: nextCursor,
    lastLiveAt: nextCursor,
    sessionStatus: session.status,
  }
}
