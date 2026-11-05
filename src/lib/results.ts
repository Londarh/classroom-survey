import type { PostgrestError } from '@supabase/supabase-js'
import type { ExportData } from './csv.ts'
import { supabase } from './supabase'
import type { SurveyStatus } from './surveys.ts'

export interface ResultChoice {
  choice_id: string
  choice_text: string
  count: number
  /** Share of this question's answers, one decimal (0 when unanswered). */
  percentage: number
}

export interface ResultQuestion {
  question_id: string
  question_text: string
  question_type: 'multiple_choice' | 'true_false'
  /** How many answers this question received. */
  response_count: number
  choices: ResultChoice[]
}

export interface SurveyResults {
  survey_id: string
  title: string
  status: SurveyStatus
  response_count: number
  questions: ResultQuestion[]
}

/**
 * Counts and percentages from the get_survey_results function, or null if
 * there is no such survey. Throws for any other failure.
 */
export async function getSurveyResults(
  id: string,
): Promise<SurveyResults | null> {
  const { data, error } = await supabase.rpc('get_survey_results', {
    p_survey_id: id,
  })
  if (error) {
    if (error.message === 'SURVEY_NOT_FOUND') return null
    throw error
  }
  return data as SurveyResults
}

// ---------------------------------------------------------------------------
// Fetching everything for the CSV export
// ---------------------------------------------------------------------------

/** What we ask for per request. Supabase returns at most 1000 rows by default. */
const PAGE_SIZE = 1000

interface PageResult<T> {
  data: T[] | null
  error: PostgrestError | null
  count: number | null
}

/**
 * Reads every row of a query, one page at a time. A single request returns at
 * most 1000 rows (the server's limit), so a big class would otherwise be cut
 * off silently. We keep going until we have the total the server reported, or
 * until a page comes back empty, so it also works if the server's limit is
 * lower than our page size.
 */
async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null

  for (;;) {
    const { data, error, count } = await fetchPage(
      rows.length,
      rows.length + PAGE_SIZE - 1,
    )
    if (error) throw error
    if (total === null && count !== null) total = count

    const batch = data ?? []
    rows.push(...batch)

    if (batch.length === 0) break
    if (total !== null && rows.length >= total) break
  }
  return rows
}

/** Everything the CSV needs: the questions, all responses, and all answers. */
export async function loadExportData(id: string): Promise<ExportData> {
  const results = await getSurveyResults(id)
  if (!results) throw new Error('Survey not found')

  const questions = results.questions.map((question) => ({
    id: question.question_id,
    text: question.question_text,
    choices: Object.fromEntries(
      question.choices.map((choice) => [choice.choice_id, choice.choice_text]),
    ),
  }))
  const questionIds = questions.map((question) => question.id)

  // Oldest first. The id breaks ties so pages never overlap or skip a row.
  const responses = await fetchAllRows<{ id: string; submitted_at: string }>(
    (from, to) =>
      supabase
        .from('responses')
        .select('id, submitted_at', { count: 'exact' })
        .eq('survey_id', id)
        .order('submitted_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  )

  // Answers have no survey column, but each belongs to one of this survey's
  // questions. Ordered by creation time, then id, so that answers arriving
  // while we page through are added at the end instead of shifting the pages.
  const answers =
    questionIds.length === 0
      ? []
      : await fetchAllRows<{
          response_id: string
          question_id: string
          choice_id: string | null
        }>((from, to) =>
          supabase
            .from('answers')
            .select('response_id, question_id, choice_id', { count: 'exact' })
            .in('question_id', questionIds)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        )

  return { title: results.title, questions, responses, answers }
}
