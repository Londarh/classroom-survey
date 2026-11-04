import { supabase } from './supabase'
import { questionsFromServer, toQuestionsPayload } from './surveyEditor.ts'
import type { DraftSurvey, ServerQuestion } from './surveyEditor.ts'

export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived'

export const SURVEY_STATUSES: SurveyStatus[] = [
  'draft',
  'active',
  'closed',
  'archived',
]

/** The fields the dashboard needs for each survey. */
export interface SurveySummary {
  id: string
  title: string
  status: SurveyStatus
  created_at: string
}

/** All surveys, newest first. RLS limits this to the logged-in instructor. */
export async function listSurveys(): Promise<SurveySummary[]> {
  const { data, error } = await supabase
    .from('surveys')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as SurveySummary[]
}

/** A survey loaded for the editor, with its questions and choices. */
export interface SurveyForEdit {
  id: string
  status: SurveyStatus
  draft: DraftSurvey
}

/** Loads one survey with its questions and choices, or null if not found. */
export async function getSurveyForEdit(
  id: string,
): Promise<SurveyForEdit | null> {
  const { data, error } = await supabase
    .from('surveys')
    .select(
      'id, title, description, status, questions(question_text, question_type, position, choices(choice_text, position))',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as unknown as {
    id: string
    title: string
    description: string | null
    status: SurveyStatus
    questions: ServerQuestion[]
  }
  return {
    id: row.id,
    status: row.status,
    draft: {
      title: row.title,
      description: row.description ?? '',
      questions: questionsFromServer(row.questions),
    },
  }
}

/** A failed action, with a message that is safe to show to the instructor. */
export class SurveyActionError extends Error {
  /** 1-based number of the question the problem is about, when known. */
  questionNumber?: number

  constructor(message: string, questionNumber?: number) {
    super(message)
    this.name = 'SurveyActionError'
    this.questionNumber = questionNumber
  }
}

/**
 * Turns an error from one of the database functions into plain language. The
 * functions raise a code (such as SURVEY_INCOMPLETE) as the error message, and
 * many also include a readable "details" sentence, for example
 * "Every question needs at least two choices." which we show as it is.
 */
function toActionError(
  error: { message: string; details?: string | null },
  fallback: string,
): SurveyActionError {
  const detail = error.details?.trim()
  switch (error.message) {
    case 'VALIDATION_ERROR': {
      const text = detail || 'Some of the survey details are not valid.'
      const match = /question (\d+)/i.exec(text)
      return new SurveyActionError(text, match ? Number(match[1]) : undefined)
    }
    case 'SURVEY_NOT_EDITABLE':
      return new SurveyActionError('Only drafts can be edited.')
    case 'SURVEY_NOT_FOUND':
      return new SurveyActionError('This survey no longer exists.')
    case 'NOT_AUTHORIZED':
      return new SurveyActionError(
        'Your login has expired. Please log in again, then try again.',
      )
    case 'SURVEY_INCOMPLETE':
      return new SurveyActionError(
        detail ||
          'The survey is not complete: it needs a question, and every question needs at least two choices.',
      )
    case 'INVALID_STATUS_TRANSITION':
      return new SurveyActionError(
        detail || 'The survey is not in a state that allows that.',
      )
    case 'ACTIVATION_CONFLICT':
      return new SurveyActionError(
        detail || 'Another survey was activated at the same time. Try again.',
      )
    default:
      return new SurveyActionError(fallback)
  }
}

/**
 * Saves a whole draft (title, description, questions, choices) through the
 * save_draft_survey function, which writes everything in one transaction.
 * Pass null as the id to create a new survey. Returns the survey's id.
 */
export async function saveDraftSurvey(
  id: string | null,
  draft: DraftSurvey,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_draft_survey', {
    p_survey_id: id,
    p_title: draft.title.trim(),
    p_description: draft.description.trim(),
    p_questions: toQuestionsPayload(draft),
  })

  if (error) {
    console.error('save_draft_survey failed', error)
    throw toActionError(
      error,
      "We couldn't save the survey. Check your connection and try again.",
    )
  }
  return (data as { id: string }).id
}

// ---------------------------------------------------------------------------
// Status changes. These go through the database functions (never a plain
// update of the surveys table) so the one-active-survey rule, the slug and the
// allowed transitions are enforced in one place.
// ---------------------------------------------------------------------------

async function callStatusFunction(
  name: 'activate_survey' | 'close_survey' | 'archive_survey',
  id: string,
  fallback: string,
): Promise<void> {
  const { error } = await supabase.rpc(name, { p_survey_id: id })
  if (error) {
    console.error(`${name} failed`, error)
    throw toActionError(error, fallback)
  }
}

/** draft -> active. Closes any other active survey and creates the slug. */
export function activateSurvey(id: string): Promise<void> {
  return callStatusFunction(
    'activate_survey',
    id,
    "We couldn't activate the survey. Check your connection and try again.",
  )
}

/** active -> closed. Students can no longer submit. */
export function closeSurvey(id: string): Promise<void> {
  return callStatusFunction(
    'close_survey',
    id,
    "We couldn't close the survey. Check your connection and try again.",
  )
}

/** draft or closed -> archived. Responses are kept. */
export function archiveSurvey(id: string): Promise<void> {
  return callStatusFunction(
    'archive_survey',
    id,
    "We couldn't archive the survey. Check your connection and try again.",
  )
}

/** Permanently deletes a survey with its questions, choices and responses. */
export async function deleteSurvey(id: string): Promise<void> {
  const { error } = await supabase.from('surveys').delete().eq('id', id)
  if (error) {
    console.error('Delete failed', error)
    throw new SurveyActionError(
      "We couldn't delete the survey. Check your connection and try again.",
    )
  }
}

/** How many responses a survey has received (instructor only, via RLS). */
export async function getResponseCount(id: string): Promise<number> {
  const { count, error } = await supabase
    .from('responses')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', id)
  if (error) throw error
  return count ?? 0
}

/** What the present page needs about a survey. */
export interface PresentSurvey {
  id: string
  title: string
  status: SurveyStatus
  public_slug: string | null
}

export interface PresentSnapshot {
  survey: PresentSurvey | null
  responseCount: number
}

/** The survey (or null if it does not exist) and its current response count. */
export async function getPresentSnapshot(id: string): Promise<PresentSnapshot> {
  const [surveyResult, responseCount] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, status, public_slug')
      .eq('id', id)
      .maybeSingle(),
    getResponseCount(id),
  ])
  if (surveyResult.error) throw surveyResult.error
  return {
    survey: (surveyResult.data as PresentSurvey | null) ?? null,
    responseCount,
  }
}
