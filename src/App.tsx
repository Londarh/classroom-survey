import { Route, Routes } from 'react-router'
import ConfigMissing from './components/ConfigMissing.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import { isSupabaseConfigured } from './lib/supabase.ts'
import Dashboard from './pages/Dashboard.tsx'
import Landing from './pages/Landing.tsx'
import Login from './pages/Login.tsx'
import NotFound from './pages/NotFound.tsx'
import SurveyEditor from './pages/SurveyEditor.tsx'
import SurveyPresent from './pages/SurveyPresent.tsx'
import SurveyResults from './pages/SurveyResults.tsx'

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Instructor-only pages: visitors who are not logged in go to /login. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/surveys/new" element={<SurveyEditor />} />
        <Route path="/surveys/:id/edit" element={<SurveyEditor />} />
        <Route path="/surveys/:id/present" element={<SurveyPresent />} />
        <Route path="/surveys/:id/results" element={<SurveyResults />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
