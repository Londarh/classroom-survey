import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  SurveyActionError,
  activateSurvey,
  archiveSurvey,
  closeSurvey,
  deleteSurvey,
  getResponseCount,
} from '../lib/surveys.ts'
import type { SurveySummary } from '../lib/surveys.ts'
import { dangerButton, secondaryButton } from '../lib/styles.ts'
import StatusBadge from './StatusBadge.tsx'

type Confirmation =
  | { kind: 'close' }
  | { kind: 'archive' }
  | { kind: 'delete'; responses: number }

interface SurveyCardProps {
  survey: SurveySummary
  /** True while any card on the dashboard is running an action. */
  disabled: boolean
  /** Lets the dashboard disable every button while this card works. */
  onBusyChange: (busy: boolean) => void
  /** Called after a change, so the dashboard can reload the list. */
  onChanged: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export default function SurveyCard({
  survey,
  disabled,
  onBusyChange,
  onChanged,
}: SurveyCardProps) {
  const navigate = useNavigate()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { status } = survey

  // Runs one action: keeps every button disabled while it works and shows a
  // plain-language message on this card if it fails.
  async function run(action: () => Promise<void>) {
    setWorking(true)
    onBusyChange(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(
        err instanceof SurveyActionError
          ? err.message
          : 'Something went wrong. Check your connection and try again.',
      )
    } finally {
      setWorking(false)
      onBusyChange(false)
    }
  }

  function activate() {
    return run(async () => {
      await activateSurvey(survey.id)
      navigate(`/surveys/${survey.id}/present`)
    })
  }

  // Deleting first looks up how many responses would be lost, so the warning
  // can say so.
  function askDelete() {
    return run(async () => {
      let responses: number
      try {
        responses = await getResponseCount(survey.id)
      } catch (err) {
        console.error('Could not count responses', err)
        throw new SurveyActionError(
          "We couldn't check this survey's responses, so it was not deleted. Try again.",
        )
      }
      setConfirmation({ kind: 'delete', responses })
    })
  }

  function confirmAction() {
    if (!confirmation) return
    return run(async () => {
      if (confirmation.kind === 'close') await closeSurvey(survey.id)
      else if (confirmation.kind === 'archive') await archiveSurvey(survey.id)
      else await deleteSurvey(survey.id)
      setConfirmation(null)
      onChanged()
    })
  }

  const buttons = disabled || working

  return (
    <li className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{survey.title}</h2>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Created: {formatDate(survey.created_at)}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
        >
          {error}
        </p>
      )}

      {confirmation ? (
        <div
          role="alertdialog"
          aria-label="Confirm"
          className="mt-3 space-y-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900"
        >
          {confirmation.kind === 'close' && (
            <p>
              Close &ldquo;{survey.title}&rdquo;? Students will no longer be
              able to submit responses.
            </p>
          )}
          {confirmation.kind === 'archive' && (
            <p>
              Archive &ldquo;{survey.title}&rdquo;? It can&apos;t be edited or
              activated again. Its responses are kept.
            </p>
          )}
          {confirmation.kind === 'delete' && (
            <div className="space-y-2">
              <p>
                Delete &ldquo;{survey.title}&rdquo;? This will permanently
                delete the survey and its questions
                {confirmation.responses === 0 && '.'}
                {confirmation.responses > 0 && (
                  <>
                    {' '}
                    and{' '}
                    <strong>
                      all {plural(confirmation.responses, 'response')}
                    </strong>{' '}
                    it has received.
                  </>
                )}
              </p>
              {confirmation.responses > 0 && (
                <p className="font-semibold">
                  {plural(confirmation.responses, 'response')} will be lost.
                  This cannot be undone. Consider archiving it instead.
                </p>
              )}
              {status === 'active' && (
                <p>
                  This survey is active, so students lose access to it
                  immediately.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={buttons}
              onClick={() => setConfirmation(null)}
              className={secondaryButton}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={buttons}
              onClick={confirmAction}
              className={dangerButton}
            >
              {working
                ? 'Working...'
                : confirmation.kind === 'close'
                  ? 'Close survey'
                  : confirmation.kind === 'archive'
                    ? 'Archive survey'
                    : confirmation.responses > 0
                      ? `Delete survey and ${plural(confirmation.responses, 'response')}`
                      : 'Delete survey'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {status === 'draft' && (
            <>
              <Link
                to={`/surveys/${survey.id}/edit`}
                aria-disabled={buttons}
                className={`${secondaryButton} ${buttons ? 'pointer-events-none opacity-60' : ''}`}
                tabIndex={buttons ? -1 : undefined}
              >
                Edit
              </Link>
              <button
                type="button"
                disabled={buttons}
                onClick={activate}
                className={secondaryButton}
              >
                {working ? 'Working...' : 'Activate'}
              </button>
            </>
          )}
          {status === 'active' && (
            <>
              <Link
                to={`/surveys/${survey.id}/present`}
                aria-disabled={buttons}
                className={`${secondaryButton} ${buttons ? 'pointer-events-none opacity-60' : ''}`}
                tabIndex={buttons ? -1 : undefined}
              >
                Present
              </Link>
              <button
                type="button"
                disabled={buttons}
                onClick={() => setConfirmation({ kind: 'close' })}
                className={secondaryButton}
              >
                Close
              </button>
            </>
          )}
          {(status === 'draft' || status === 'closed') && (
            <button
              type="button"
              disabled={buttons}
              onClick={() => setConfirmation({ kind: 'archive' })}
              className={secondaryButton}
            >
              Archive
            </button>
          )}
          <button
            type="button"
            disabled={buttons}
            onClick={askDelete}
            className={secondaryButton}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  )
}
