import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../lib/useAuth.ts'

function friendlyLoginError(error: unknown): string {
  if (isAuthRetryableFetchError(error)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (isAuthApiError(error)) {
    if (error.status === 429) {
      return 'Too many attempts. Please wait a minute and try again.'
    }
    if (error.status === 400) return 'Incorrect email or password.'
  }
  return 'Something went wrong. Please try again.'
}

export default function Login() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Where to go after logging in: the page they were sent away from, if any.
  const from = (location.state as { from?: string } | null)?.from
  const destination = from && from.startsWith('/') ? from : '/dashboard'

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-600">
        <p role="status">Loading...</p>
      </main>
    )
  }

  // Already logged in: skip the form.
  if (session) return <Navigate to={destination} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(friendlyLoginError(err))
      setSubmitting(false)
    }
  }

  const inputClass =
    'mt-1 block w-full min-h-11 rounded-lg border border-slate-400 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-slate-900">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5"
        aria-label="Instructor login"
      >
        <h1 className="text-3xl font-bold">Instructor Login</h1>

        <div>
          <label htmlFor="email" className="block font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className="block font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded-lg bg-slate-900 px-6 py-3 text-lg font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Logging in...' : 'Log In'}
        </button>

        <p className="text-center">
          <Link
            to="/"
            className="text-slate-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Back to home
          </Link>
        </p>
      </form>
    </main>
  )
}
