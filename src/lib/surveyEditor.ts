// Form model, validation, and conversion helpers for the survey editor.
// Pure logic with no React and no network, so it is easy to reason about.

export type QuestionType = 'multiple_choice' | 'true_false'

/** Matches the limits enforced by save_draft_survey in the database. */
export const LIMITS = {
  title: 200,
  description: 2000,
  question: 1000,
  choice: 500,
  questions: 50,
  maxChoices: 20,
  minChoices: 2,
}

// Every question and choice gets a random key so React (and the validation
// messages) can follow it around when items are moved or deleted.
export interface DraftChoice {
  key: string
  text: string
}

export interface DraftQuestion {
  key: string
  text: string
  type: QuestionType
  /** Kept even for true/false questions, so switching back loses nothing. */
  choices: DraftChoice[]
}

export interface DraftSurvey {
  title: string
  description: string
  questions: DraftQuestion[]
}

export function newChoice(text = ''): DraftChoice {
  return { key: crypto.randomUUID(), text }
}

export function newQuestion(): DraftQuestion {
  return {
    key: crypto.randomUUID(),
    text: '',
    type: 'multiple_choice',
    choices: [newChoice(), newChoice()],
  }
}

/** Title for a duplicated survey, kept within the title length limit. */
export function copyTitle(title: string): string {
  return `Copy of ${title}`.slice(0, LIMITS.title).trim()
}

/** Returns a copy of the list with the item at `index` moved by `offset`. */
export function moveItem<T>(list: T[], index: number, offset: number): T[] {
  const target = index + offset
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  return copy
}

// ---------------------------------------------------------------------------
// Validation (checks the obvious things before calling the database)
// ---------------------------------------------------------------------------

export interface QuestionErrors {
  text?: string
  /** Problem with the choice list as a whole, e.g. fewer than two. */
  choices?: string
  /** Problems with individual choices, by choice key. */
  choiceTexts: Record<string, string>
}

export interface DraftErrors {
  title?: string
  questions: Record<string, QuestionErrors>
  hasErrors: boolean
}

export function validateDraft(draft: DraftSurvey): DraftErrors {
  const errors: DraftErrors = { questions: {}, hasErrors: false }

  if (draft.title.trim() === '') {
    errors.title = 'Enter a title for the survey.'
    errors.hasErrors = true
  }

  for (const question of draft.questions) {
    const q: QuestionErrors = { choiceTexts: {} }

    if (question.text.trim() === '') {
      q.text = 'Enter the question text.'
    }

    // True/false questions get their choices from the database.
    if (question.type === 'multiple_choice') {
      if (question.choices.length < LIMITS.minChoices) {
        q.choices = 'Add at least two choices.'
      }
      for (const choice of question.choices) {
        if (choice.text.trim() === '') {
          q.choiceTexts[choice.key] = 'Enter the choice text or remove it.'
        }
      }
    }

    if (q.text || q.choices || Object.keys(q.choiceTexts).length > 0) {
      errors.questions[question.key] = q
      errors.hasErrors = true
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Conversion to and from the database shapes
// ---------------------------------------------------------------------------

/** The JSON array that save_draft_survey expects, in display order. */
export function toQuestionsPayload(draft: DraftSurvey) {
  return draft.questions.map((question) => ({
    question_text: question.text.trim(),
    question_type: question.type,
    ...(question.type === 'multiple_choice'
      ? {
          choices: question.choices.map((choice) => ({
            choice_text: choice.text.trim(),
          })),
        }
      : {}),
  }))
}

interface ServerChoice {
  choice_text: string
  position: number
}

export interface ServerQuestion {
  question_text: string
  question_type: QuestionType
  position: number
  choices: ServerChoice[]
}

/** Builds the form state from a survey's questions as stored in the database. */
export function questionsFromServer(rows: ServerQuestion[]): DraftQuestion[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const choices = [...row.choices]
        .sort((a, b) => a.position - b.position)
        .map((choice) => newChoice(choice.choice_text))
      return {
        key: crypto.randomUUID(),
        text: row.question_text,
        type: row.question_type,
        // A multiple-choice question always has choices; if one somehow has
        // none, show the two empty boxes the editor starts with.
        choices:
          choices.length > 0 || row.question_type === 'true_false'
            ? choices
            : [newChoice(), newChoice()],
      }
    })
}
