import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID, createHash } from 'crypto'

// GET /api/devices - List all devices
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch devices with groups and stats
    const { data: devices, error } = await supabase
      .from('devices')
      .select(`
        *,
        device_groups(name),
        sessions: sessions(count)
      `)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ devices: devices || [] })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch devices' },
      { status: 500 }
    )
  }
}

// POST /api/devices - Create new device
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await request.json()

    const { device_name, device_type = 'esp32', device_group_id, notes, sensor_config } = body

    if (!device_name) {
      return NextResponse.json(
        { error: 'Device name is required' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Generate device credentials
    const deviceId = randomUUID()
    const deviceSecret = `asc_${randomUUID().replace(/-/g, '')}`
    const deviceSecretHash = createHash('sha256').update(deviceSecret).digest('hex')

    // Create device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .insert({
        id: deviceId,
        org_id: profile.org_id,
        owner_user_id: user.id,
        device_name,
        device_type,
        device_group_id: device_group_id || null,
        device_secret_hash: deviceSecretHash,
        notes: notes || null,
        sensor_config: sensor_config || {},
        status: 'offline'
      })
      .select()
      .single()

    if (deviceError) throw deviceError

    // Create audit log
    await supabase
      .from('audit_logs')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        action: 'device_created',
        entity_type: 'device',
        entity_id: deviceId,
        metadata: { device_name, device_type }
      })

    return NextResponse.json({
      device,
      credentials: {
        device_id: deviceId,
        device_secret: deviceSecret, // Show only once!
        org_id: profile.org_id
      }
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create device' },
      { status: 500 }
    )
  }
}
