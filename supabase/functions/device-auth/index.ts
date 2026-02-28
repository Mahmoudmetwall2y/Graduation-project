// Device Authentication Edge Function
// Validates device credentials and returns short-lived token

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

function getCorsHeaders(req: Request) {
  const envOrigins = (Deno.env.get('CORS_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean)
  const requestOrigin = req.headers.get('Origin') || ''
  // F5 fix: unknown origins get 'null' (opaque), not the first allowed origin
  const allowOrigin = envOrigins.length === 0
    ? '*'
    : (envOrigins.includes(requestOrigin) ? requestOrigin : 'null')

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

// F1: Generate a cryptographically signed token (HMAC-SHA256) that encodes
// device_id, org_id, and expiry. Can be verified offline by any service
// holding the DEVICE_JWT_SECRET environment variable.
async function generateDeviceToken(
  deviceId: string,
  orgId: string,
  expiresIn: number
): Promise<string> {
  const secret = Deno.env.get('DEVICE_JWT_SECRET')
  if (!secret || secret.length < 32) {
    throw new Error('DEVICE_JWT_SECRET must be set and at least 32 characters')
  }

  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
  const payload = JSON.stringify({ sub: deviceId, org: orgId, exp: expiresAt })
  const payloadB64 = btoa(payload).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const keyBytes = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${payloadB64}.${sigB64}`
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

    // F1 fix: Generate a proper HMAC-SHA256 signed token (replaces the fake timestamp token)
    const expiresIn = 3600 // 1 hour
    const token = await generateDeviceToken(device_id, device.org_id, expiresIn)

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
