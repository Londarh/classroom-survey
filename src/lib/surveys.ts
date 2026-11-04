import { supabase } from './supabase'

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
