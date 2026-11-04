import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import SurveyCard from '../components/SurveyCard.tsx'
import { SURVEY_STATUSES, listSurveys } from '../lib/surveys.ts'
import type { SurveyStatus, SurveySummary } from '../lib/surveys.ts'
import { fieldClass, primaryButton, secondaryButton } from '../lib/styles.ts'
import { useAuth } from '../lib/useAuth.ts'

const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
}

export default function Dashboard() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SurveyStatus | 'all'>('all')
  const [loggingOut, setLoggingOut] = useState(false)
  // True while any card is running an action; every button is then disabled.
  const [busy, setBusy] = useState(false)

  // Load the surveys on first show, and again whenever Try again is pressed.
  useEffect(() => {
    let active = true
    listSurveys()
      .then((data) => {
        if (!active) return
        setSurveys(data)
        setFailed(false)
      })
      .catch((error) => {
        console.error('Could not load surveys', error)
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  function retry() {
    setLoading(true)
    setFailed(false)
    setReloadKey((key) => key + 1)
  }

  // Reload the list after a survey was closed, archived or deleted. The current
  // list stays on screen while it reloads.
  function refresh() {
    setReloadKey((key) => key + 1)
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
    } catch (error) {
      // The local login is cleared even if the server could not be told.
      console.error('Logout problem', error)
    }
    navigate('/login', { replace: true })
  }

  const visibleSurveys = useMemo(() => {
    const term = search.trim().toLowerCase()
    return surveys.filter(
      (survey) =>
        (statusFilter === 'all' || survey.status === statusFilter) &&
        survey.title.toLowerCase().includes(term),
    )
  }, [surveys, search, statusFilter])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-sm text-slate-600">Classroom Survey</p>
            <h1 className="text-2xl font-bold">Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-600">
              Logged in as{' '}
              <span className="font-medium text-slate-900">
                {session?.user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={secondaryButton}
            >
              {loggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="search" className="block font-medium">
              Search
            </label>
            <input
              id="search"
              type="search"
              placeholder="Search by title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="w-40">
            <label htmlFor="status" className="block font-medium">
              Status
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as SurveyStatus | 'all')
              }
              className={fieldClass}
            >
              <option value="all">All</option>
              {SURVEY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <Link to="/surveys/new" className={primaryButton}>
            New Survey
          </Link>
        </div>

        {loading ? (
          <p role="status" className="py-8 text-center text-slate-600">
            Loading surveys...
          </p>
        ) : failed ? (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
          >
            <p>
              We couldn&apos;t load your surveys. Check your connection and try
              again.
            </p>
            <button type="button" onClick={retry} className={secondaryButton}>
              Try again
            </button>
          </div>
        ) : surveys.length === 0 ? (
          <div className="space-y-4 py-12 text-center">
            <p className="text-lg text-slate-700">
              You have not created any surveys yet.
            </p>
            <Link to="/surveys/new" className={primaryButton}>
              Create Your First Survey
            </Link>
          </div>
        ) : visibleSurveys.length === 0 ? (
          <p className="py-8 text-center text-slate-700">
            No surveys match your search.
          </p>
        ) : (
          <ul className="space-y-3">
            {visibleSurveys.map((survey) => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                disabled={busy}
                onBusyChange={setBusy}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
