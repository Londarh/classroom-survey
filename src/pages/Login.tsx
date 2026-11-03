import { Link } from 'react-router'

// Placeholder: the real login form (Supabase Auth) is built in Phase 3.
export default function Login() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center text-slate-900">
      <h1 className="text-3xl font-bold">Instructor Login</h1>
      <p className="text-slate-600">The login form is coming soon.</p>
      <Link
        to="/"
        className="text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Back to home
      </Link>
    </main>
  )
}
