import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingScreen } from '@/components/LoadingScreen'
import { useAuth } from './auth-context'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth()
  const location = useLocation()

  if (loading && !profile) {
    return <LoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
