import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function getRequestOrigin(request: Request, requestUrl: URL) {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')

  if (host) {
    return `${forwardedProto || requestUrl.protocol.replace(':', '')}://${host}`
  }

  return requestUrl.origin
}

function redirectToLogin(request: Request, requestUrl: URL, error: string, message?: string) {
  const loginUrl = new URL('/auth/login', getRequestOrigin(request, requestUrl))
  loginUrl.searchParams.set('error', error)
  if (message) {
    loginUrl.searchParams.set('message', message)
  }
  return NextResponse.redirect(loginUrl)
}

async function ensureUserProfile(user: {
  id: string
  email?: string | null
  user_metadata?: { full_name?: string | null }
}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      message: 'Supabase service credentials are missing for profile provisioning.',
    }
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: existingProfile, error: existingError } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (existingError) {
    return { ok: false, message: existingError.message }
  }

  if (existingProfile) {
    return { ok: true }
  }

  let orgId = process.env.DEFAULT_SIGNUP_ORG_ID
  if (!orgId) {
    const { data: organizations, error: orgError } = await serviceClient
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(2)

    if (orgError) {
      return { ok: false, message: orgError.message }
    }

    if (!organizations || organizations.length === 0) {
      orgId = undefined
    } else if (organizations.length === 1) {
      orgId = organizations[0].id
    } else {
      return {
        ok: false,
        message:
          'Multiple organizations exist. Set DEFAULT_SIGNUP_ORG_ID or use an admin-led invite flow before allowing self-signup.',
      }
    }
  }

  if (!orgId) {
    return {
      ok: false,
      message: 'No organization is available to attach the new user profile.',
    }
  }

  const fullName =
    user.user_metadata?.full_name?.trim() ||
    user.email?.split('@')[0] ||
    'AscultiCor User'

  const { error: insertError } = await serviceClient
    .from('profiles')
    .insert({
      id: user.id,
      org_id: orgId,
      full_name: fullName,
      role: 'operator',
    })

  if (insertError) {
    return { ok: false, message: insertError.message }
  }

  return { ok: true }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next') || '/dashboard'

  if (!code) {
    return redirectToLogin(
      request,
      requestUrl,
      'missing_code',
      'Authentication code was not provided.'
    )
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session?.user) {
    return redirectToLogin(
      request,
      requestUrl,
      'auth_callback_failed',
      error?.message || 'Unable to exchange the authentication code for a session.'
    )
  }

  const profileResult = await ensureUserProfile(data.session.user)
  if (!profileResult.ok) {
    await supabase.auth.signOut()
    return redirectToLogin(request, requestUrl, 'profile_setup_failed', profileResult.message)
  }

  const destination = new URL(
    type === 'recovery' ? '/settings' : next,
    getRequestOrigin(request, requestUrl)
  )
  return NextResponse.redirect(destination)
}
