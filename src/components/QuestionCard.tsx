import { LIMITS } from '../lib/surveyEditor.ts'
import type {
  DraftQuestion,
  QuestionErrors,
  QuestionType,
} from '../lib/surveyEditor.ts'
import {
  fieldClass,
  fieldErrorClass,
  secondaryButton,
  smallButton,
} from '../lib/styles.ts'

export interface QuestionCardProps {
  question: DraftQuestion
  /** 0-based position in the survey. */
  index: number
  total: number
  /** Validation problems, shown only after the first save attempt. */
  errors?: QuestionErrors
  /** A problem reported by the database for this question. */
  serverError?: string
  /** True while the "are you sure?" prompt for this question is open. */
  confirmingDelete: boolean
  disabled: boolean
  onTextChange: (text: string) => void
  onTypeChange: (type: QuestionType) => void
  onMove: (offset: -1 | 1) => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onAddChoice: () => void
  onChoiceTextChange: (choiceKey: string, text: string) => void
  onMoveChoice: (choiceKey: string, offset: -1 | 1) => void
  onRemoveChoice: (choiceKey: string) => void
}

export default function QuestionCard(props: QuestionCardProps) {
  const { question, index, total, errors, serverError, disabled } = props
  const number = index + 1
  const textId = `question-${question.key}-text`
  const typeId = `question-${question.key}-type`
  const isMultipleChoice = question.type === 'multiple_choice'

  return (
    <section
      aria-labelledby={`question-${question.key}-heading`}
      className="space-y-4 rounded-lg border border-slate-300 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`question-${question.key}-heading`}
          className="text-lg font-semibold"
        >
          Question {number}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={`Move question ${number} up`}
            disabled={disabled || index === 0}
            onClick={() => props.onMove(-1)}
            className={smallButton}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move question ${number} down`}
            disabled={disabled || index === total - 1}
            onClick={() => props.onMove(1)}
            className={smallButton}
          >
            ↓
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={textId} className="block font-medium">
          Question text
        </label>
        <input
          id={textId}
          type="text"
          value={question.text}
          maxLength={LIMITS.question}
          disabled={disabled}
          aria-invalid={errors?.text ? true : undefined}
          aria-describedby={errors?.text ? `${textId}-error` : undefined}
          onChange={(e) => props.onTextChange(e.target.value)}
          className={fieldClass}
        />
        {errors?.text && (
          <p id={`${textId}-error`} className={fieldErrorClass}>
            {errors.text}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={typeId} className="block font-medium">
          Type
        </label>
        <select
          id={typeId}
          value={question.type}
          disabled={disabled}
          onChange={(e) => props.onTypeChange(e.target.value as QuestionType)}
          className={`${fieldClass} sm:max-w-xs`}
        >
          <option value="multiple_choice">Multiple Choice</option>
          <option value="true_false">True / False</option>
        </select>
      </div>

      {isMultipleChoice ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Choices</legend>
          {question.choices.map((choice, choiceIndex) => {
            const choiceId = `choice-${choice.key}`
            const choiceError = errors?.choiceTexts[choice.key]
            const choiceNumber = choiceIndex + 1
            return (
              <div key={choice.key}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <label htmlFor={choiceId} className="sr-only">
                      Choice {choiceNumber} of question {number}
                    </label>
                    <input
                      id={choiceId}
                      type="text"
                      value={choice.text}
                      maxLength={LIMITS.choice}
                      disabled={disabled}
                      placeholder={`Choice ${choiceNumber}`}
                      aria-invalid={choiceError ? true : undefined}
                      aria-describedby={
                        choiceError ? `${choiceId}-error` : undefined
                      }
                      onChange={(e) =>
                        props.onChoiceTextChange(choice.key, e.target.value)
                      }
                      className={`${fieldClass} mt-0`}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Move choice ${choiceNumber} of question ${number} up`}
                    disabled={disabled || choiceIndex === 0}
                    onClick={() => props.onMoveChoice(choice.key, -1)}
                    className={`${smallButton} min-h-11`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move choice ${choiceNumber} of question ${number} down`}
                    disabled={
                      disabled || choiceIndex === question.choices.length - 1
                    }
                    onClick={() => props.onMoveChoice(choice.key, 1)}
                    className={`${smallButton} min-h-11`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove choice ${choiceNumber} of question ${number}`}
                    title={
                      question.choices.length <= LIMITS.minChoices
                        ? 'A question needs at least two choices'
                        : undefined
                    }
                    disabled={
                      disabled || question.choices.length <= LIMITS.minChoices
                    }
                    onClick={() => props.onRemoveChoice(choice.key)}
                    className={`${smallButton} min-h-11`}
                  >
                    Remove
                  </button>
                </div>
                {choiceError && (
                  <p id={`${choiceId}-error`} className={fieldErrorClass}>
                    {choiceError}
                  </p>
                )}
              </div>
            )
          })}

          {errors?.choices && (
            <p role="alert" className={fieldErrorClass}>
              {errors.choices}
            </p>
          )}

          <button
            type="button"
            disabled={disabled || question.choices.length >= LIMITS.maxChoices}
            onClick={props.onAddChoice}
            className={secondaryButton}
          >
            + Add Choice
          </button>
        </fieldset>
      ) : (
        <p className="text-slate-600">
          Students will see the choices <strong>True</strong> and{' '}
          <strong>False</strong>. They are added automatically.
        </p>
      )}

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
        >
          {serverError}
        </p>
      )}

      {props.confirmingDelete ? (
        <div
          role="alertdialog"
          aria-label={`Delete question ${number}?`}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3"
        >
          <p className="flex-1 text-red-900">
            Delete question {number}? This removes its choices too.
          </p>
          <button
            type="button"
            onClick={props.onCancelDelete}
            className={secondaryButton}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirmDelete}
            className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-5 py-2 font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Delete
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={props.onAskDelete}
          className={secondaryButton}
        >
          Delete Question
        </button>
      )}
    </section>
  )
}
