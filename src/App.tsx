import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'
import ConfigMissing from './components/ConfigMissing.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import { isSupabaseConfigured } from './lib/supabase.ts'
import Dashboard from './pages/Dashboard.tsx'
import Landing from './pages/Landing.tsx'
import Login from './pages/Login.tsx'
import NotFound from './pages/NotFound.tsx'
import StudentSurvey from './pages/StudentSurvey.tsx'
import SurveyEditor from './pages/SurveyEditor.tsx'
import SurveyPresent from './pages/SurveyPresent.tsx'

// Loaded on demand: the results page brings in the charting library, which
// students opening a survey on their phones should not have to download.
const SurveyResults = lazy(() => import('./pages/SurveyResults.tsx'))

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Public student page, reached from the QR code. No login. */}
      <Route path="/s/:slug" element={<StudentSurvey />} />

      {/* Instructor-only pages: visitors who are not logged in go to /login. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/surveys/new" element={<SurveyEditor />} />
        <Route path="/surveys/:id/edit" element={<SurveyEditor />} />
        <Route path="/surveys/:id/present" element={<SurveyPresent />} />
        <Route
          path="/surveys/:id/results"
          element={
            <Suspense
              fallback={
                <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
                  <p role="status">Loading results...</p>
                </main>
              }
            >
              <SurveyResults />
            </Suspense>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
