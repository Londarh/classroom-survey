import { Link } from 'react-router'

// Placeholder: the real results page (counts, percentages, charts) is built in
// Phase 9.
export default function SurveyResults() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center text-slate-900">
      <h1 className="text-3xl font-bold">Results</h1>
      <p className="text-slate-600">The results page is coming soon.</p>
      <Link
        to="/dashboard"
        className="text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Back to dashboard
      </Link>
    </main>
  )
}
