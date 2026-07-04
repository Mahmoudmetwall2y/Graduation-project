'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState } from 'react'

export type UserRole = 'admin' | 'visitor' | null

interface UseUserRoleResult {
  role: UserRole
  isAdmin: boolean
  isVisitor: boolean
  loading: boolean
}

/**
 * Fetches and caches the current user's role from their profile.
 * Returns null while loading or if the user is not authenticated.
 */
export function useUserRole(): UseUserRoleResult {
  const [role, setRole] = useState<UserRole>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    let cancelled = false

    async function fetchRole() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          if (!cancelled) setLoading(false)
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (!cancelled) {
          const fetchedRole = profile?.role as UserRole
          setRole(fetchedRole ?? null)
        }
      } catch {
        // Non-fatal — leave role as null
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRole()
    return () => { cancelled = true }
  }, [supabase])

  return {
    role,
    isAdmin: role === 'admin',
    isVisitor: role === 'visitor',
    loading,
  }
}
