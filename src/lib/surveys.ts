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

/** A failed save, with a message that is safe to show to the instructor. */
export class SaveSurveyError extends Error {
  /** 1-based number of the question the problem is about, when known. */
  questionNumber?: number

  constructor(message: string, questionNumber?: number) {
    super(message)
    this.name = 'SaveSurveyError'
    this.questionNumber = questionNumber
  }
}

/**
 * Turns an error from save_draft_survey into plain language. The function
 * raises codes as the error message; VALIDATION_ERROR also has a readable
 * "details" text such as "Question 2 needs between 2 and 20 choices."
 */
function toSaveError(error: { message: string; details?: string | null }) {
  switch (error.message) {
    case 'VALIDATION_ERROR': {
      const detail =
        error.details?.trim() || 'Some of the survey details are not valid.'
      const match = /question (\d+)/i.exec(detail)
      return new SaveSurveyError(detail, match ? Number(match[1]) : undefined)
    }
    case 'SURVEY_NOT_EDITABLE':
      return new SaveSurveyError('Only drafts can be edited.')
    case 'SURVEY_NOT_FOUND':
      return new SaveSurveyError('This survey no longer exists.')
    case 'NOT_AUTHORIZED':
      return new SaveSurveyError(
        'Your login has expired. Please log in again, then save.',
      )
    default:
      return new SaveSurveyError(
        "We couldn't save the survey. Check your connection and try again.",
      )
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
    throw toSaveError(error)
  }
  return (data as { id: string }).id
}
