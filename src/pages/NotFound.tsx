import { Link } from 'react-router'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center text-slate-900">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Back to home
      </Link>
    </main>
  )
}
