import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../lib/useAuth.ts'

/**
 * Wraps instructor-only routes. While the saved login is being checked it shows
 * a loading message; with no login it sends the visitor to /login and
 * remembers where they were headed.
 */
export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-600">
        <p role="status">Loading...</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
