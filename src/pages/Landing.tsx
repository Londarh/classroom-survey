import { Link } from 'react-router'

export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 text-center text-slate-900">
      <h1 className="text-4xl font-bold sm:text-5xl">Classroom Survey</h1>
      <p className="text-lg text-slate-600 sm:text-xl">
        Quick in-class understanding checks
      </p>
      <Link
        to="/login"
        className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-6 py-3 text-lg font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Instructor Login
      </Link>
    </main>
  )
}
