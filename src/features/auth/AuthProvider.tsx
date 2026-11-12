import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import { clearUserCaches } from '@/lib/user-storage'
import type { Profile } from '@/types/database'
import { AuthContext } from './auth-context'
import { loadCachedProfile, saveCachedProfile } from './profile-cache'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRef = useRef<Profile | null>(null)

  useEffect(() => {
    let active = true

    async function loadProfile(userId: string) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = loadCachedProfile(userId)

        if (active) {
          profileRef.current = cached
          setProfile(cached)
          setLoading(false)
        }

        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('No se pudo cargar el perfil', error)
      }

      if (active) {
        const resolved = data ?? loadCachedProfile(userId)

        if (resolved) {
          saveCachedProfile(resolved)
        }

        profileRef.current = resolved
        setProfile(resolved)
        setLoading(false)
      }
    }

    void supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!active) return

      setSession(currentSession)

      if (currentSession?.user) {
        void loadProfile(currentSession.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'INITIAL_SESSION') return

      setSession(currentSession)

      if (!currentSession?.user) {
        const userId = profileRef.current?.id

        profileRef.current = null
        setProfile(null)
        setLoading(false)
        queryClient.clear()

        // Política offline: cerrar sesión limpia perfil/cachés/borradores,
        // pero conserva las colas de ventas y gastos pendientes.
        if (userId) {
          clearUserCaches(userId)
        }

        return
      }

      if (event === 'TOKEN_REFRESHED') {
        if (profileRef.current) return

        setLoading(true)
        void loadProfile(currentSession.user.id)
        return
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (profileRef.current?.id === currentSession.user.id) {
          void loadProfile(currentSession.user.id)
          return
        }

        queryClient.clear()
        setLoading(true)
        void loadProfile(currentSession.user.id)
        return
      }

      if (!profileRef.current) {
        setLoading(true)
        void loadProfile(currentSession.user.id)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    const userId = profileRef.current?.id ?? session?.user.id

    await supabase.auth.signOut()
    profileRef.current = null
    setProfile(null)
    queryClient.clear()

    if (userId) {
      clearUserCaches(userId)
    }
  }

  async function updateProfileName(fullName: string) {
    const { data, error } = await supabase.rpc('update_my_profile', {
      p_full_name: fullName,
    })

    if (error) throw error

    saveCachedProfile(data)
    profileRef.current = data
    setProfile(data)
    return data
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, updateProfileName }}>
      {children}
    </AuthContext.Provider>
  )
}
