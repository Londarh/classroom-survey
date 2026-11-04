import { Route, Routes } from 'react-router'
import ConfigMissing from './components/ConfigMissing.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import { isSupabaseConfigured } from './lib/supabase.ts'
import Dashboard from './pages/Dashboard.tsx'
import Landing from './pages/Landing.tsx'
import Login from './pages/Login.tsx'
import NewSurvey from './pages/NewSurvey.tsx'
import NotFound from './pages/NotFound.tsx'

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Instructor-only pages: visitors who are not logged in go to /login. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/surveys/new" element={<NewSurvey />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
