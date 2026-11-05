import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useParams } from 'react-router'
import { hasSubmitted, markSubmitted } from '../lib/browserStorage.ts'
import {
  SubmitError,
  getPublicSurvey,
  submitResponse,
} from '../lib/publicSurvey.ts'
import type {
  Answers,
  PublicQuestion,
  PublicSurvey,
} from '../lib/publicSurvey.ts'
import { MESSAGES } from '../lib/studentMessages.ts'

type View =
  | { kind: 'loading' }
  | { kind: 'load_failed' }
  | { kind: 'not_found' }
  | { kind: 'closed' }
  | { kind: 'already_submitted' }
  | { kind: 'thanks' }
  | { kind: 'form'; survey: PublicSurvey; questions: PublicQuestion[] }

/** A centred full-screen message. Students get nothing but the survey: no menu, no links. */
function Message({
  children,
  role,
}: {
  children: ReactNode
  role?: 'status' | 'alert'
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-slate-900">
      <div role={role} className="max-w-md space-y-3 text-xl">
        {children}
      </div>
    </main>
  )
}

/**
 * The public page a student opens from the QR code (/s/:slug). No login. It
 * asks get_public_survey what the slug points at, then shows the survey, a
 * "closed" or "not found" message, or "already submitted".
 */
export default function StudentSurvey() {
  const { slug } = useParams()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    getPublicSurvey(slug ?? '')
      .then((result) => {
        if (!active) return
        if (result.status === 'not_found') setView({ kind: 'not_found' })
        else if (result.status === 'closed') setView({ kind: 'closed' })
        else if (hasSubmitted(result.survey.id))
          setView({ kind: 'already_submitted' })
        else
          setView({
            kind: 'form',
            survey: result.survey,
            questions: [...result.questions].sort(
              (a, b) => a.position - b.position,
            ),
          })
      })
      .catch((error) => {
        console.error('Could not load survey', error)
        if (active) setView({ kind: 'load_failed' })
      })
    return () => {
      active = false
    }
  }, [slug, reloadKey])

  switch (view.kind) {
    case 'loading':
      return (
        <Message role="status">
          <p className="text-slate-600">Loading survey...</p>
        </Message>
      )
    case 'load_failed':
      return (
        <Message role="alert">
          <p>{MESSAGES.loadFailed}</p>
          <button
            type="button"
            onClick={() => {
              setView({ kind: 'loading' })
              setReloadKey((key) => key + 1)
            }}
            className="min-h-12 rounded-lg border border-slate-400 px-6 py-2 text-lg font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Try again
          </button>
        </Message>
      )
    case 'not_found':
      return (
        <Message>
          <p>{MESSAGES.notFound}</p>
        </Message>
      )
    case 'closed':
      return (
        <Message>
          <p>{MESSAGES.closed}</p>
        </Message>
      )
    case 'already_submitted':
      return (
        <Message>
          <p>{MESSAGES.alreadySubmitted}</p>
        </Message>
      )
    case 'thanks':
      return (
        <Message role="status">
          <h1 className="text-4xl font-bold">Thank you!</h1>
          <p>{MESSAGES.thanks}</p>
        </Message>
      )
    case 'form':
      return (
        <SurveyForm
          survey={view.survey}
          questions={view.questions}
          onFinished={(next) => setView({ kind: next })}
        />
      )
  }
}

function SurveyForm({
  survey,
  questions,
  onFinished,
}: {
  survey: PublicSurvey
  questions: PublicQuestion[]
  /** Called when the form should be replaced by a message. */
  onFinished: (next: 'thanks' | 'already_submitted' | 'closed') => void
}) {
  const [answers, setAnswers] = useState<Answers>({})
  const [missing, setMissing] = useState<Record<string, true>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function choose(questionId: string, choiceId: string) {
    setAnswers((current) => ({ ...current, [questionId]: choiceId }))
    // The question is answered now, so its "please choose" message goes away.
    setMissing((current) => {
      if (!current[questionId]) return current
      const rest = { ...current }
      delete rest[questionId]
      return rest
    })
    setSubmitError(null)
  }

  function scrollToQuestion(questionId: string) {
    const group = document.getElementById(`question-${questionId}`)
    if (!group) return
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    group.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
    group.querySelector('input')?.focus({ preventScroll: true })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    // Every question is required: nothing is sent until all are answered.
    const unanswered = questions.filter((question) => !answers[question.id])
    if (unanswered.length > 0) {
      setMissing(
        Object.fromEntries(unanswered.map((q) => [q.id, true as const])),
      )
      setSubmitError(null)
      scrollToQuestion(unanswered[0].id)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitResponse(survey.id, answers)
      markSubmitted(survey.id)
      onFinished('thanks')
    } catch (error) {
      const failure = error instanceof SubmitError ? error.failure : 'other'
      if (failure === 'duplicate') {
        markSubmitted(survey.id)
        onFinished('already_submitted')
      } else if (failure === 'closed') {
        onFinished('closed')
      } else {
        setSubmitError(
          failure === 'missing' ? MESSAGES.missingAnswer : MESSAGES.general,
        )
        setSubmitting(false)
      }
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-slate-900">
      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold">{survey.title}</h1>
        {survey.description && (
          <p className="mt-2 text-lg text-slate-700">{survey.description}</p>
        )}

        <div className="mt-8 space-y-8">
          {questions.map((question, index) => {
            const errorId = `question-${question.id}-error`
            const isMissing = Boolean(missing[question.id])
            return (
              <fieldset
                key={question.id}
                id={`question-${question.id}`}
                aria-describedby={isMissing ? errorId : undefined}
                disabled={submitting}
                className="scroll-mt-4 space-y-3"
              >
                <legend className="mb-3 text-xl font-semibold">
                  {index + 1}. {question.question_text}
                </legend>

                {[...question.choices]
                  .sort((a, b) => a.position - b.position)
                  .map((choice) => (
                    <label
                      key={choice.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-400 px-4 py-3 text-lg has-checked:border-slate-900 has-checked:bg-slate-100 has-checked:font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-slate-900"
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={choice.id}
                        checked={answers[question.id] === choice.id}
                        onChange={() => choose(question.id, choice.id)}
                        className="size-6 shrink-0 accent-slate-900"
                      />
                      <span>{choice.choice_text}</span>
                    </label>
                  ))}

                {isMissing && (
                  <p
                    id={errorId}
                    role="alert"
                    className="text-lg font-medium text-red-800"
                  >
                    {MESSAGES.unanswered}
                  </p>
                )}
              </fieldset>
            )
          })}
        </div>

        {submitError && (
          <p
            role="alert"
            className="mt-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-lg text-red-900"
          >
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-8 min-h-14 w-full rounded-lg bg-slate-900 px-6 py-3 text-xl font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </main>
  )
}
