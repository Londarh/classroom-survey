import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import ResultsChart from '../components/ResultsChart.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { buildCsv, csvFileName, downloadCsv } from '../lib/csv.ts'
import { getSurveyResults, loadExportData } from '../lib/results.ts'
import type { SurveyResults as Results } from '../lib/results.ts'
import { primaryButton, secondaryButton } from '../lib/styles.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LoadState = 'loading' | 'ready' | 'not_found' | 'error'

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function PageMessage({
  children,
  role,
}: {
  children: ReactNode
  role?: 'status' | 'alert'
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center text-slate-900">
      <div role={role} className="space-y-4">
        {children}
      </div>
      <Link to="/dashboard" className={secondaryButton}>
        Back to Dashboard
      </Link>
    </main>
  )
}

/**
 * Two different survey ids can reach this page without it being unmounted
 * (browser back/forward, an edited URL), and React would keep the previous
 * survey's data on screen. Keying the view by id starts it fresh each time.
 */
export default function SurveyResults() {
  const { id } = useParams()
  return <SurveyResultsView key={id ?? 'none'} id={id} />
}

function SurveyResultsView({ id }: { id: string | undefined }) {
  const validId = id !== undefined && UUID_PATTERN.test(id)

  const [loadState, setLoadState] = useState<LoadState>(
    validId ? 'loading' : 'not_found',
  )
  const [results, setResults] = useState<Results | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  // First load, and again when "Try again" is pressed.
  useEffect(() => {
    if (!validId) return
    let active = true
    getSurveyResults(id)
      .then((data) => {
        if (!active) return
        if (!data) setLoadState('not_found')
        else {
          setResults(data)
          setLoadState('ready')
        }
      })
      .catch((error) => {
        console.error('Could not load results', error)
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [id, validId, reloadKey])

  function retryLoad() {
    setLoadState('loading')
    setReloadKey((key) => key + 1)
  }

  // Refresh keeps the current numbers on screen until the new ones arrive.
  async function handleRefresh() {
    if (!id || refreshing) return
    setRefreshing(true)
    setRefreshError(false)
    try {
      const data = await getSurveyResults(id)
      if (!data) setLoadState('not_found')
      else setResults(data)
    } catch (error) {
      console.error('Could not refresh results', error)
      setRefreshError(true)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleExport() {
    if (!id || exporting) return
    setExporting(true)
    setExportError(false)
    try {
      const data = await loadExportData(id)
      downloadCsv(csvFileName(data.title, new Date()), buildCsv(data))
    } catch (error) {
      console.error('Could not export CSV', error)
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  if (loadState === 'loading') {
    return (
      <PageMessage role="status">
        <p className="text-slate-600">Loading results...</p>
      </PageMessage>
    )
  }
  if (loadState === 'not_found') {
    return (
      <PageMessage>
        <p className="text-lg">Survey not found.</p>
      </PageMessage>
    )
  }
  if (loadState === 'error' || !results) {
    return (
      <PageMessage role="alert">
        <p className="text-lg">
          We couldn&apos;t load the results. Check your connection and try
          again.
        </p>
        <button type="button" onClick={retryLoad} className={secondaryButton}>
          Try again
        </button>
      </PageMessage>
    )
  }

  const hasResponses = results.response_count > 0
  const isActive = results.status === 'active'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-2xl font-bold">{results.title}</h1>
            <StatusBadge status={results.status} />
          </div>
          <p className="text-lg text-slate-700" aria-live="polite">
            {plural(results.response_count, 'response')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={secondaryButton}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || !hasResponses}
              className={secondaryButton}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            {isActive && (
              <Link
                to={`/surveys/${results.survey_id}/present`}
                className={secondaryButton}
              >
                Present QR
              </Link>
            )}
            <Link to="/dashboard" className={secondaryButton}>
              Back to Dashboard
            </Link>
          </div>
          {refreshError && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
            >
              We couldn&apos;t refresh the results. Showing the numbers from
              before; try again.
            </p>
          )}
          {exportError && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
            >
              We couldn&apos;t export the file. Check your connection and try
              again.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {!hasResponses ? (
          <div className="space-y-4 py-12 text-center">
            <p className="text-xl text-slate-800">No responses yet.</p>
            {isActive && (
              <>
                <p className="text-slate-600">
                  Display the QR code so students can join.
                </p>
                <Link
                  to={`/surveys/${results.survey_id}/present`}
                  className={primaryButton}
                >
                  Present QR
                </Link>
              </>
            )}
          </div>
        ) : (
          results.questions.map((question, index) => (
            <section
              key={question.question_id}
              aria-labelledby={`result-${question.question_id}`}
              className="space-y-3 rounded-lg border border-slate-300 bg-white p-4"
            >
              <h2
                id={`result-${question.question_id}`}
                className="text-lg font-semibold"
              >
                {index + 1}. {question.question_text}
              </h2>
              {question.response_count === 0 ? (
                <p className="text-slate-600">No answers yet.</p>
              ) : (
                <>
                  <ResultsChart question={question} />
                  <p className="text-sm text-slate-600">
                    {plural(question.response_count, 'answer')}
                  </p>
                </>
              )}
            </section>
          ))
        )}
      </main>
    </div>
  )
}
