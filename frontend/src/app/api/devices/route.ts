import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

// GET /api/devices - List all devices
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id and role
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

    return NextResponse.json({
      devices: devices || [],
      current_user_role: profile.role,
      can_create_devices: profile.role === 'admin'
    })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
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

    // Get user's org_id and role
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only admins can create and provision devices' },
        { status: 403 }
      )
    }

    const mqttUser = process.env.MQTT_USERNAME
    const mqttPass = process.env.MQTT_PASSWORD
    if (!mqttUser || !mqttPass) {
      return NextResponse.json(
        { error: 'Server misconfiguration: MQTT_USERNAME and MQTT_PASSWORD are required for device provisioning' },
        { status: 500 }
      )
    }

    // Generate device credentials
    const deviceId = randomUUID()
    const deviceSecret = `asc_${randomUUID().replace(/-/g, '')}`
    const deviceSecretHash = await bcrypt.hash(deviceSecret, 12)

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
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        action: 'device_created',
        entity_type: 'device',
        entity_id: deviceId,
        metadata: { device_name, device_type }
      })
    if (auditError) console.error('Audit log failed (device_created):', auditError)

    return NextResponse.json({
      device,
      credentials: {
        device_id: deviceId,
        device_secret: deviceSecret, // Show only once!
        org_id: profile.org_id,
        mqtt_user: mqttUser,
        mqtt_pass: mqttPass
      }
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating device:', error)
    return NextResponse.json(
      { error: 'Failed to create device' },
      { status: 500 }
    )
  }
}
