import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  SurveyActionError,
  activateSurvey,
  archiveSurvey,
  closeSurvey,
  deleteSurvey,
  duplicateSurvey,
  getResponseCount,
} from '../lib/surveys.ts'
import type { SurveySummary } from '../lib/surveys.ts'
import { dangerButton, secondaryButton } from '../lib/styles.ts'
import { useConfirmFocus } from '../lib/useConfirmFocus.ts'
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
  // Which action is running, so only that button shows "...ing".
  const [currentAction, setCurrentAction] = useState<string | null>(null)
  // Which button opened the last confirmation (focus returns to it on cancel).
  const [lastKind, setLastKind] = useState<Confirmation['kind']>('close')
  const cardRef = useRef<HTMLLIElement>(null)
  useConfirmFocus(
    confirmation !== null,
    cardRef,
    `[data-confirm-trigger="${lastKind}"]`,
  )
  const [error, setError] = useState<string | null>(null)

  const { status } = survey

  // Runs one action: keeps every button disabled while it works and shows a
  // plain-language message on this card if it fails.
  async function run(name: string, action: () => Promise<void>) {
    setWorking(true)
    setCurrentAction(name)
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
      setCurrentAction(null)
      onBusyChange(false)
    }
  }

  function activate() {
    return run('activate', async () => {
      await activateSurvey(survey.id)
      navigate(`/surveys/${survey.id}/present`)
    })
  }

  // Deleting first looks up how many responses would be lost, so the warning
  // can say so.
  function askDelete() {
    return run('delete-check', async () => {
      let responses: number
      try {
        responses = await getResponseCount(survey.id)
      } catch (err) {
        console.error('Could not count responses', err)
        throw new SurveyActionError(
          "We couldn't check this survey's responses, so it was not deleted. Try again.",
        )
      }
      setLastKind('delete')
      setConfirmation({ kind: 'delete', responses })
    })
  }

  function confirmAction() {
    if (!confirmation) return
    return run('confirm', async () => {
      if (confirmation.kind === 'close') await closeSurvey(survey.id)
      else if (confirmation.kind === 'archive') await archiveSurvey(survey.id)
      else await deleteSurvey(survey.id)
      setConfirmation(null)
      onChanged()
    })
  }

  // Duplicate: the copy is made through save_draft_survey, then the editor opens.
  function duplicate() {
    return run('duplicate', async () => {
      const newId = await duplicateSurvey(survey.id)
      navigate(`/surveys/${newId}/edit`)
    })
  }

  function openConfirmation(next: Confirmation) {
    setLastKind(next.kind)
    setConfirmation(next)
  }

  const buttons = disabled || working

  return (
    <li
      ref={cardRef}
      className="rounded-lg border border-slate-300 bg-white p-4"
    >
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
          aria-label={
            confirmation.kind === 'close'
              ? `Close ${survey.title}?`
              : confirmation.kind === 'archive'
                ? `Archive ${survey.title}?`
                : `Delete ${survey.title}?`
          }
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
                      {confirmation.responses === 1 ? 'the' : 'all'}{' '}
                      {plural(confirmation.responses, 'response')}
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
              data-confirm-cancel
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
                {currentAction === 'activate' ? 'Activating...' : 'Activate'}
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
              <Link
                to={`/surveys/${survey.id}/results`}
                aria-disabled={buttons}
                className={`${secondaryButton} ${buttons ? 'pointer-events-none opacity-60' : ''}`}
                tabIndex={buttons ? -1 : undefined}
              >
                Results
              </Link>
              <button
                type="button"
                disabled={buttons}
                data-confirm-trigger="close"
                onClick={() => openConfirmation({ kind: 'close' })}
                className={secondaryButton}
              >
                Close
              </button>
            </>
          )}
          {(status === 'closed' || status === 'archived') && (
            <Link
              to={`/surveys/${survey.id}/results`}
              aria-disabled={buttons}
              className={`${secondaryButton} ${buttons ? 'pointer-events-none opacity-60' : ''}`}
              tabIndex={buttons ? -1 : undefined}
            >
              Results
            </Link>
          )}
          <button
            type="button"
            disabled={buttons}
            onClick={duplicate}
            className={secondaryButton}
          >
            {currentAction === 'duplicate' ? 'Duplicating...' : 'Duplicate'}
          </button>
          {(status === 'draft' || status === 'closed') && (
            <button
              type="button"
              disabled={buttons}
              data-confirm-trigger="archive"
              onClick={() => openConfirmation({ kind: 'archive' })}
              className={secondaryButton}
            >
              Archive
            </button>
          )}
          <button
            type="button"
            disabled={buttons}
            data-confirm-trigger="delete"
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
