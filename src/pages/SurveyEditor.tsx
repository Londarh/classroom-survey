import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import QuestionCard from '../components/QuestionCard.tsx'
import {
  SaveSurveyError,
  getSurveyForEdit,
  saveDraftSurvey,
} from '../lib/surveys.ts'
import {
  LIMITS,
  moveItem,
  newChoice,
  newQuestion,
  validateDraft,
} from '../lib/surveyEditor.ts'
import type {
  DraftQuestion,
  DraftSurvey,
  QuestionType,
} from '../lib/surveyEditor.ts'
import {
  fieldClass,
  fieldErrorClass,
  primaryButton,
  secondaryButton,
} from '../lib/styles.ts'

type LoadState = 'loading' | 'ready' | 'not_found' | 'not_draft' | 'error'
type SaveState = 'idle' | 'saving' | 'saved'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EMPTY_DRAFT: DraftSurvey = { title: '', description: '', questions: [] }

/** Full-page message used for loading, not-found, not-a-draft and error states. */
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
        Back to dashboard
      </Link>
    </main>
  )
}

/**
 * /surveys/new and /surveys/:id/edit both render this page. React would reuse
 * one component instance across them (keeping stale state, such as a "Saving..."
 * button that never resets), so the form is keyed by the survey id: a new id,
 * or going from "new" to a saved survey, always starts a fresh form.
 */
export default function SurveyEditor() {
  const { id } = useParams()
  return <SurveyEditorForm key={id ?? 'new'} id={id} />
}

function SurveyEditorForm({ id }: { id: string | undefined }) {
  const isNew = id === undefined
  const navigate = useNavigate()
  const location = useLocation()

  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (isNew) return 'ready'
    return UUID_PATTERN.test(id) ? 'loading' : 'not_found'
  })
  const [reloadKey, setReloadKey] = useState(0)

  const [draft, setDraft] = useState<DraftSurvey>(EMPTY_DRAFT)
  // A newly created survey arrives here right after its first save.
  const [saveState, setSaveState] = useState<SaveState>(
    (location.state as { saved?: boolean } | null)?.saved ? 'saved' : 'idle',
  )
  // Validation messages appear only after the first attempt to save.
  const [attempted, setAttempted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)

  const saving = saveState === 'saving'

  // Load an existing survey when editing.
  useEffect(() => {
    if (isNew || !UUID_PATTERN.test(id)) return
    let active = true
    getSurveyForEdit(id)
      .then((result) => {
        if (!active) return
        if (!result) setLoadState('not_found')
        else if (result.status !== 'draft') setLoadState('not_draft')
        else {
          setDraft(result.draft)
          setLoadState('ready')
        }
      })
      .catch((error) => {
        console.error('Could not load survey', error)
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [id, isNew, reloadKey])

  function retryLoad() {
    setLoadState('loading')
    setReloadKey((key) => key + 1)
  }

  // Every change to the form goes through here: it clears "Saved" and any
  // stale error from the last save attempt.
  function edit(change: (current: DraftSurvey) => DraftSurvey) {
    setDraft(change)
    setSaveState((state) => (state === 'saving' ? state : 'idle'))
    setServerErrors({})
    setFormError(null)
  }

  function editQuestion(
    key: string,
    change: (question: DraftQuestion) => DraftQuestion,
  ) {
    edit((current) => ({
      ...current,
      questions: current.questions.map((q) => (q.key === key ? change(q) : q)),
    }))
  }

  const validation = useMemo(() => validateDraft(draft), [draft])

  async function handleSave() {
    if (saving) return
    setAttempted(true)
    setFormError(null)
    setServerErrors({})

    if (validation.hasErrors) {
      setFormError('Fix the problems marked below, then save again.')
      return
    }

    setSaveState('saving')
    try {
      const savedId = await saveDraftSurvey(isNew ? null : id, draft)
      if (isNew) {
        // Continue on the edit page of the survey that was just created.
        navigate(`/surveys/${savedId}/edit`, {
          replace: true,
          state: { saved: true },
        })
      } else {
        setSaveState('saved')
      }
    } catch (error) {
      setSaveState('idle')
      const message =
        error instanceof SaveSurveyError
          ? error.message
          : "We couldn't save the survey. Check your connection and try again."
      const questionKey =
        error instanceof SaveSurveyError && error.questionNumber
          ? draft.questions[error.questionNumber - 1]?.key
          : undefined
      if (questionKey) setServerErrors({ [questionKey]: message })
      else setFormError(message)
    }
  }

  if (loadState === 'loading') {
    return (
      <PageMessage role="status">
        <p className="text-slate-600">Loading survey...</p>
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
  if (loadState === 'not_draft') {
    return (
      <PageMessage role="alert">
        <h1 className="text-2xl font-bold">This survey can&apos;t be edited</h1>
        <p className="text-slate-700">Only drafts can be edited.</p>
      </PageMessage>
    )
  }
  if (loadState === 'error') {
    return (
      <PageMessage role="alert">
        <p className="text-lg">
          We couldn&apos;t load this survey. Check your connection and try
          again.
        </p>
        <button type="button" onClick={retryLoad} className={secondaryButton}>
          Try again
        </button>
      </PageMessage>
    )
  }

  const shown = attempted ? validation : null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-2xl font-bold">
            {isNew ? 'New Survey' : 'Edit Survey'}
          </h1>
          <Link to="/dashboard" className={secondaryButton}>
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <section className="space-y-4 rounded-lg border border-slate-300 bg-white p-4">
          <div>
            <label htmlFor="survey-title" className="block font-medium">
              Survey Title
            </label>
            <input
              id="survey-title"
              type="text"
              value={draft.title}
              maxLength={LIMITS.title}
              disabled={saving}
              aria-invalid={shown?.title ? true : undefined}
              aria-describedby={shown?.title ? 'survey-title-error' : undefined}
              onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))}
              className={fieldClass}
            />
            {shown?.title && (
              <p id="survey-title-error" className={fieldErrorClass}>
                {shown.title}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="survey-description" className="block font-medium">
              Description{' '}
              <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <textarea
              id="survey-description"
              rows={3}
              value={draft.description}
              maxLength={LIMITS.description}
              disabled={saving}
              onChange={(e) =>
                edit((d) => ({ ...d, description: e.target.value }))
              }
              className={fieldClass}
            />
          </div>
        </section>

        {draft.questions.length === 0 && (
          <p className="py-4 text-center text-slate-600">
            No questions yet. Add your first question below.
          </p>
        )}

        {draft.questions.map((question, index) => (
          <QuestionCard
            key={question.key}
            question={question}
            index={index}
            total={draft.questions.length}
            errors={shown?.questions[question.key]}
            serverError={serverErrors[question.key]}
            confirmingDelete={confirmDeleteKey === question.key}
            disabled={saving}
            onTextChange={(text) =>
              editQuestion(question.key, (q) => ({ ...q, text }))
            }
            onTypeChange={(type: QuestionType) =>
              editQuestion(question.key, (q) => ({ ...q, type }))
            }
            onMove={(offset) =>
              edit((d) => ({
                ...d,
                questions: moveItem(d.questions, index, offset),
              }))
            }
            onAskDelete={() => setConfirmDeleteKey(question.key)}
            onCancelDelete={() => setConfirmDeleteKey(null)}
            onConfirmDelete={() => {
              setConfirmDeleteKey(null)
              edit((d) => ({
                ...d,
                questions: d.questions.filter((q) => q.key !== question.key),
              }))
            }}
            onAddChoice={() =>
              editQuestion(question.key, (q) => ({
                ...q,
                choices: [...q.choices, newChoice()],
              }))
            }
            onChoiceTextChange={(choiceKey, text) =>
              editQuestion(question.key, (q) => ({
                ...q,
                choices: q.choices.map((c) =>
                  c.key === choiceKey ? { ...c, text } : c,
                ),
              }))
            }
            onMoveChoice={(choiceKey, offset) =>
              editQuestion(question.key, (q) => ({
                ...q,
                choices: moveItem(
                  q.choices,
                  q.choices.findIndex((c) => c.key === choiceKey),
                  offset,
                ),
              }))
            }
            onRemoveChoice={(choiceKey) =>
              editQuestion(question.key, (q) => ({
                ...q,
                choices: q.choices.filter((c) => c.key !== choiceKey),
              }))
            }
          />
        ))}

        <button
          type="button"
          disabled={saving || draft.questions.length >= LIMITS.questions}
          onClick={() =>
            edit((d) => ({ ...d, questions: [...d.questions, newQuestion()] }))
          }
          className={secondaryButton}
        >
          + Add Question
        </button>

        <div className="space-y-3 border-t border-slate-300 pt-6">
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={primaryButton}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <span role="status" className="text-slate-700">
              {saveState === 'saved' ? 'Saved' : ''}
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
