// Building the results CSV in the browser. The functions that build the text
// are pure (no network, no DOM) so they are easy to test; only downloadCsv()
// touches the page.

export interface ExportQuestion {
  id: string
  text: string
  /** choice id -> choice text */
  choices: Record<string, string>
}

export interface ExportData {
  title: string
  /** In display order: becomes the columns, left to right. */
  questions: ExportQuestion[]
  /** In submission order: becomes the rows, top to bottom. */
  responses: { id: string; submitted_at: string }[]
  answers: {
    response_id: string
    question_id: string
    choice_id: string | null
  }[]
}

/**
 * Makes one value safe for a CSV file:
 *  1. A value starting with =, +, - or @ (or a tab or carriage return) would be
 *     run as a formula by Excel, Sheets and similar, so a single quote is put in
 *     front of it. The spreadsheet shows the quote as a text marker, not as
 *     part of the value.
 *  2. A value containing a comma, a double quote or a line break is wrapped in
 *     double quotes, and any double quote inside it is doubled.
 */
export function escapeCsvCell(value: string): string {
  let cell = value
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`
  return cell
}

/**
 * The whole file as text: the header row first, then one row per response with
 * the response id and submission time, then one column per question holding the
 * text of the choice that was picked (empty if there is no answer).
 */
export function buildCsv(data: ExportData): string {
  // question id + response id -> chosen choice id
  const picked = new Map<string, string | null>()
  for (const answer of data.answers) {
    picked.set(`${answer.response_id}|${answer.question_id}`, answer.choice_id)
  }

  const rows: string[][] = [
    [
      'response_id',
      'submitted_at',
      ...data.questions.map((question) => question.text),
    ],
  ]

  for (const response of data.responses) {
    rows.push([
      response.id,
      response.submitted_at,
      ...data.questions.map((question) => {
        const choiceId = picked.get(`${response.id}|${question.id}`)
        return choiceId ? (question.choices[choiceId] ?? '') : ''
      }),
    ])
  }

  // Rows end with CRLF, as the CSV standard (RFC 4180) says.
  return (
    rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n'
  )
}

/** "Recursion Concept Check!" on 2026-11-05 -> "recursion-concept-check-2026-11-05.csv" */
export function csvFileName(title: string, date: Date): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${slug || 'survey'}-${day}.csv`
}

/** Saves text as a .csv file download. */
export function downloadCsv(fileName: string, csv: string): void {
  // The invisible byte-order mark makes Excel read accents and other
  // non-English characters correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Give the browser a moment to start the download before releasing the file.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
