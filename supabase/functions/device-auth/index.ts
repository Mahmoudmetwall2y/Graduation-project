// Device Authentication Edge Function
// Validates device credentials and returns short-lived token

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

function getCorsHeaders(req: Request) {
  const envOrigins = (Deno.env.get('CORS_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean)
  const requestOrigin = req.headers.get('Origin') || ''
  const allowOrigin = envOrigins.length === 0
    ? '*'
    : (envOrigins.includes(requestOrigin) ? requestOrigin : envOrigins[0])

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const { device_id, device_secret } = await req.json()

    if (!device_id || !device_secret) {
      return new Response(
        JSON.stringify({ error: 'device_id and device_secret are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch device
    const { data: device, error: fetchError } = await supabase
      .from('devices')
      .select('id, org_id, device_name, device_secret_hash, last_seen_at')
      .eq('id', device_id)
      .single()

    if (fetchError || !device) {
      console.error('Device not found:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Invalid device credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify secret
    const isValid = await bcrypt.compare(device_secret, device.device_secret_hash)

    if (!isValid) {
      console.error('Invalid device secret')
      return new Response(
        JSON.stringify({ error: 'Invalid device credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update last_seen_at
    await supabase
      .from('devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', device_id)

    // Generate short-lived token (simplified - in production use JWT)
    const token = `device_${device_id}_${Date.now()}`
    const expiresIn = 3600 // 1 hour

    // Insert audit log
    await supabase
      .from('audit_logs')
      .insert({
        org_id: device.org_id,
        user_id: null,
        action: 'device_authenticated',
        entity_type: 'device',
        entity_id: device_id,
        metadata: {
          device_name: device.device_name,
          timestamp: new Date().toISOString()
        }
      })

    return new Response(
      JSON.stringify({
        device_token: token,
        org_id: device.org_id,
        device_id: device.id,
        device_name: device.device_name,
        expires_in: expiresIn,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
