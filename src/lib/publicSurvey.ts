import { getAnonymousToken } from './browserStorage.ts'
import { classifySubmitError } from './studentMessages.ts'
import type { SubmitFailure } from './studentMessages.ts'
import { supabase } from './supabase'

export interface PublicChoice {
  id: string
  choice_text: string
  position: number
}

export interface PublicQuestion {
  id: string
  question_text: string
  question_type: 'multiple_choice' | 'true_false'
  position: number
  choices: PublicChoice[]
}

export interface PublicSurvey {
  id: string
  title: string
  description: string | null
}

/** What get_public_survey tells the student page. */
export type PublicSurveyResult =
  | { status: 'active'; survey: PublicSurvey; questions: PublicQuestion[] }
  | { status: 'closed' }
  | { status: 'not_found' }

/** Looks up a survey by the slug in the student's link. Throws if the request fails. */
export async function getPublicSurvey(
  slug: string,
): Promise<PublicSurveyResult> {
  const { data, error } = await supabase.rpc('get_public_survey', {
    p_slug: slug,
  })
  if (error) throw error

  const result = data as Partial<PublicSurveyResult> | null
  if (result?.status === 'closed') return { status: 'closed' }
  if (result?.status === 'not_found') return { status: 'not_found' }
  if (
    result?.status === 'active' &&
    'survey' in result &&
    'questions' in result &&
    Array.isArray(result.questions)
  ) {
    return result as PublicSurveyResult
  }
  throw new Error('Unexpected response from get_public_survey')
}

/** One answer per question: question id -> chosen choice id. */
export type Answers = Record<string, string>

/** A failed submission, already classified. Carries no database text. */
export class SubmitError extends Error {
  failure: SubmitFailure

  constructor(failure: SubmitFailure) {
    super(`Submission failed: ${failure}`)
    this.name = 'SubmitError'
    this.failure = failure
  }
}

/**
 * Sends the student's answers through submit_survey_response, together with
 * this browser's anonymous token. Throws SubmitError (never a raw database
 * error) if it fails.
 */
export async function submitResponse(
  surveyId: string,
  answers: Answers,
): Promise<void> {
  const { error } = await supabase.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_anonymous_token: getAnonymousToken(),
    p_answers: Object.entries(answers).map(([questionId, choiceId]) => ({
      question_id: questionId,
      choice_id: choiceId,
    })),
  })

  if (error) {
    // The code is for developers (console); students only see the mapped text.
    console.error('submit_survey_response failed', error)
    throw new SubmitError(classifySubmitError(error.message))
  }
}
