import { Link } from 'react-router'

// Placeholder: the real survey editor is built in Phase 5.
export default function NewSurvey() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center text-slate-900">
      <h1 className="text-3xl font-bold">New Survey</h1>
      <p className="text-slate-600">The survey editor is coming soon.</p>
      <Link
        to="/dashboard"
        className="text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Back to dashboard
      </Link>
    </main>
  )
}
