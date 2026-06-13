import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_FILE = /\.(?:png|jpe?g|gif|webp|svg|ico)$/i

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  if (PUBLIC_FILE.test(req.nextUrl.pathname)) {
    return res
  }

  // API routes: refresh the session cookie so server-side Supabase clients
  // receive a valid token. Each individual API route is responsible for
  // verifying auth (via createServerComponentClient / createRouteHandlerClient).
  // We do NOT redirect API calls to /auth/login — that would break JSON clients.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    await supabase.auth.getSession() // Refreshes cookie if needed
    return res
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Protect all non-public page routes
  if (!session && !req.nextUrl.pathname.startsWith('/auth') && req.nextUrl.pathname !== '/') {
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  // Redirect authenticated users away from auth pages → dashboard
  if (session && req.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  // Matches all routes including /api/* (previously excluded).
  // API routes get session cookie refreshed but NOT redirected on missing auth.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
