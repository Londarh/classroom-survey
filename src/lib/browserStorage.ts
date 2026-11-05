// Remembers, in the student's browser only, (1) a random anonymous token used
// to stop accidental double submissions and (2) which surveys were already
// submitted from this browser.
//
// localStorage can throw (private browsing, blocked site data, full storage), so
// every access is wrapped in try/catch and falls back to memory. In-memory
// values last until the page is reloaded; the server still rejects a repeat
// submission with the same token, so duplicates are caught either way.

const TOKEN_KEY = 'classroom-survey:anonymous-token'
const SUBMITTED_KEY = 'classroom-survey:submitted-surveys'

/** Same shape the database accepts: 16 to 128 letters, digits, "-" or "_". */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

let memoryToken: string | null = null
const memorySubmitted = new Set<string>()

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage is unavailable; the in-memory copy still works for this visit.
  }
}

/** 32 random hex characters. (crypto.randomUUID is not available on plain
 *  http pages such as a phone testing over the local network, but
 *  getRandomValues is.) */
function makeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

/** This browser's anonymous token, created the first time it is needed. */
export function getAnonymousToken(): string {
  const stored = readStorage(TOKEN_KEY)
  if (stored && TOKEN_PATTERN.test(stored)) return stored

  if (memoryToken) return memoryToken

  memoryToken = makeToken()
  writeStorage(TOKEN_KEY, memoryToken)
  return memoryToken
}

function readSubmitted(): string[] {
  try {
    const raw = readStorage(SUBMITTED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

/** Has this browser already submitted a response to this survey? */
export function hasSubmitted(surveyId: string): boolean {
  return memorySubmitted.has(surveyId) || readSubmitted().includes(surveyId)
}

/** Remember that this browser submitted to this survey. */
export function markSubmitted(surveyId: string): void {
  memorySubmitted.add(surveyId)
  const list = readSubmitted()
  if (!list.includes(surveyId)) {
    // Keep the list from growing without bound.
    writeStorage(SUBMITTED_KEY, JSON.stringify([...list, surveyId].slice(-200)))
  }
}
