import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// GET /api/devices/[id] - Get device details
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const deviceId = params.id

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

    // Fetch device with details
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select(`
        *,
        device_groups(*),
        sessions:sessions(
          id,
          status,
          created_at,
          ended_at,
          predictions:predictions(id, modality, created_at)
        )
      `)
      .eq('id', deviceId)
      .eq('org_id', profile.org_id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    // Fetch recent telemetry
    const { data: telemetry } = await supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .order('recorded_at', { ascending: false })
      .limit(24)

    // Fetch recording summaries
    const { data: summaries } = await supabase
      .from('device_recording_summaries')
      .select('*')
      .eq('device_id', deviceId)
      .order('recording_date', { ascending: false })
      .limit(30)

    // Fetch unresolved alerts
    const { data: alerts } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })

    // Calculate stats
    const stats = {
      totalSessions: device.sessions?.length || 0,
      completedSessions: device.sessions?.filter((s: any) => s.status === 'done').length || 0,
      totalRecordings: device.sessions?.reduce((acc: number, s: any) => 
        acc + (s.predictions?.length || 0), 0
      ) || 0,
      lastSession: device.sessions?.[0]?.created_at || null,
      activeAlerts: alerts?.length || 0
    }

    return NextResponse.json({
      device,
      telemetry: telemetry || [],
      summaries: summaries || [],
      alerts: alerts || [],
      stats
    })
  } catch (error: any) {
    console.error('Error fetching device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch device' },
      { status: 500 }
    )
  }
}

// PATCH /api/devices/[id] - Update device
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const deviceId = params.id
    const body = await request.json()

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

    // Verify device belongs to org
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('id, owner_user_id')
      .eq('id', deviceId)
      .eq('org_id', profile.org_id)
      .single()

    if (!existingDevice) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    // Check permissions (owner or admin)
    if (existingDevice.owner_user_id !== user.id && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update allowed fields
    const allowedUpdates = ['device_name', 'device_group_id', 'notes', 'sensor_config', 'status']
    const updates: any = {}
    
    allowedUpdates.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    })
    
    updates.updated_at = new Date().toISOString()

    const { data: device, error } = await supabase
      .from('devices')
      .update(updates)
      .eq('id', deviceId)
      .select()
      .single()

    if (error) throw error

    // Create audit log
    await supabase
      .from('audit_logs')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        action: 'device_updated',
        entity_type: 'device',
        entity_id: deviceId,
        metadata: updates
      })

    return NextResponse.json({ device })
  } catch (error: any) {
    console.error('Error updating device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update device' },
      { status: 500 }
    )
  }
}

// DELETE /api/devices/[id] - Delete device
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const deviceId = params.id

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

    // Only admins can delete devices
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Delete device (cascade will handle related records)
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', deviceId)
      .eq('org_id', profile.org_id)

    if (error) throw error

    // Create audit log
    await supabase
      .from('audit_logs')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        action: 'device_deleted',
        entity_type: 'device',
        entity_id: deviceId
      })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete device' },
      { status: 500 }
    )
  }
}
