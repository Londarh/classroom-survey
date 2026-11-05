// Messages shown to students. Students never see database error text: every
// failure from submit_survey_response is mapped to one of these.

export const MESSAGES = {
  closed: 'This survey is no longer accepting responses.',
  notFound: 'Survey not found.',
  alreadySubmitted: 'You have already submitted a response to this survey.',
  missingAnswer: 'Please answer every question before submitting.',
  unanswered: 'Please choose an answer.',
  general: 'Something went wrong. Please check your connection and try again.',
  loadFailed:
    "We couldn't load the survey. Please check your connection and try again.",
  thanks: 'Your response has been recorded.',
} as const

export type SubmitFailure = 'duplicate' | 'closed' | 'missing' | 'other'

/**
 * Classifies the error code that submit_survey_response raises (it arrives as
 * the error message). Anything unrecognised, including network errors and
 * the INVALID_* codes, counts as "other" and gets the general message.
 */
export function classifySubmitError(code: string | undefined): SubmitFailure {
  switch (code) {
    case 'DUPLICATE_RESPONSE':
      return 'duplicate'
    case 'SURVEY_NOT_ACTIVE':
      return 'closed'
    case 'MISSING_REQUIRED_ANSWER':
      return 'missing'
    default:
      return 'other'
  }
}
