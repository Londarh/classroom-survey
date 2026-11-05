#!/usr/bin/env node
// Security check for the real Supabase project.
//
//   npm run check:security
//
// It talks to the database exactly like a student's browser does: with the
// public "anon" key from .env and no login. It tries things a student must NOT
// be able to do (read results, write directly, change surveys, call the
// instructor functions) and things a student SHOULD be able to do, and prints
// PASS or FAIL for each.
//
// If TEST_INSTRUCTOR_EMAIL and TEST_INSTRUCTOR_PASSWORD are set in .env, it also
// signs in as the instructor and checks read access. Otherwise that part is
// skipped.
//
// It cannot change real data, even if a check unexpectedly succeeds:
//  - Every write targets an id that does not exist (a random UUID). An UPDATE or
//    DELETE matches nothing; an INSERT would fail its foreign key.
//  - The instructor-function calls use that same random id, so the worst case is
//    "survey not found".
//  - The submit_survey_response calls all send an invalid payload (an unknown
//    question, an unknown choice, a bad token...). That function is atomic: any
//    invalid answer rolls the whole call back, so nothing is stored.
//  - Nothing here deletes, updates or creates a real survey. No keys are
//    stored in this file; they are read from .env and never printed.

import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Setup: read .env, refuse to run with the wrong kind of key
// ---------------------------------------------------------------------------

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch {
  // No .env file: fall back to variables already set in the environment.
}

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const instructorEmail = process.env.TEST_INSTRUCTOR_EMAIL
const instructorPassword = process.env.TEST_INSTRUCTOR_PASSWORD

if (!url || !anonKey) {
  console.error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env (copy .env.example).',
  )
  process.exit(2)
}

/** Which kind of key is this? The check is only meaningful with the anon key. */
function keyKind(key) {
  if (key.startsWith('sb_secret_')) return 'secret'
  if (key.startsWith('sb_publishable_')) return 'anon'
  try {
    const payload = JSON.parse(
      Buffer.from(key.split('.')[1], 'base64url').toString('utf8'),
    )
    return payload.role ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

const kind = keyKind(anonKey)
if (kind !== 'anon') {
  console.error(
    `VITE_SUPABASE_ANON_KEY is not an anon/publishable key (it looks like: ${kind}).`,
  )
  console.error(
    'Refusing to run: a service-role or secret key bypasses every security rule, and must never be in the frontend .env.',
  )
  process.exit(2)
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}
/** A student's browser: public key, nobody logged in. */
const student = createClient(url, anonKey, clientOptions)

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const results = []
const useColor = process.stdout.isTTY
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)

/** Remove anything secret-looking from text before it is printed. */
function redact(text) {
  return String(text)
    .replaceAll(anonKey, '<key>')
    .replaceAll(url, '<url>')
    .replaceAll(instructorPassword ?? '\u0000', '<password>')
}

function report(status, name, detail = '') {
  results.push({ status, name })
  const label =
    status === 'PASS'
      ? paint(32, 'PASS')
      : status === 'FAIL'
        ? paint(31, 'FAIL')
        : paint(33, 'SKIP')
  console.log(
    `  ${label}  ${name}${detail ? paint(2, ` (${redact(detail)})`) : ''}`,
  )
}

/** Runs one check. fn returns { ok, detail } (or throws, which counts as FAIL). */
async function check(name, fn) {
  try {
    const { ok, detail } = await fn()
    report(ok ? 'PASS' : 'FAIL', name, detail)
  } catch (error) {
    report('FAIL', name, `threw: ${error?.message ?? error}`)
  }
}

const skip = (name, why) => report('SKIP', name, why)
const section = (title) => console.log(`\n${paint(1, title)}`)

// ---------------------------------------------------------------------------
// What counts as "denied"
// ---------------------------------------------------------------------------

/** Postgres "insufficient privilege" (also used for row-level-security refusals). */
const isDenied = (error) =>
  Boolean(error) &&
  (error.code === '42501' ||
    /permission denied|row-level security|not authorized/i.test(
      error.message ?? '',
    ))

const describe = (error) =>
  error ? `${error.code ?? 'error'}: ${error.message}` : 'no error'

/**
 * A read passes if it is refused, or returns no rows. "No rows" only proves
 * something if there were rows to hide, so `note` says whether there were.
 */
function deniedOrEmpty({ data, error }, note = '') {
  if (isDenied(error)) return { ok: true, detail: `denied - ${error.message}` }
  if (error)
    return { ok: false, detail: `unexpected error - ${describe(error)}` }
  if (Array.isArray(data) && data.length === 0)
    return { ok: true, detail: `returned no rows${note ? ` - ${note}` : ''}` }
  return { ok: false, detail: `LEAK: returned ${data?.length ?? '?'} row(s)` }
}

/** A write passes if it is refused, or touches nothing. (Ids never exist.) */
function deniedWrite({ data, error }) {
  if (isDenied(error)) return { ok: true, detail: `denied - ${error.message}` }
  if (error)
    return {
      ok: false,
      detail: `was NOT refused by permissions (got ${describe(error)})`,
    }
  if (!data || data.length === 0)
    return {
      ok: true,
      detail: 'matched nothing (blocked by row-level security)',
    }
  return { ok: false, detail: `CHANGED ${data.length} row(s)` }
}

/** An instructor-only function must refuse a student before doing anything. */
function deniedFunction({ error }) {
  if (isDenied(error)) return { ok: true, detail: `denied - ${error.message}` }
  return {
    ok: false,
    detail: error
      ? `got past the permission check - ${describe(error)}`
      : 'the call SUCCEEDED',
  }
}

/** The function must fail with exactly this short error code. */
function cleanCode(expected) {
  return ({ error }) => {
    if (!error) return { ok: false, detail: 'unexpectedly succeeded' }
    const clean = error.message === expected
    return {
      ok: clean,
      detail: clean
        ? `error code ${expected}`
        : `expected ${expected} but got ${describe(error)}`,
    }
  }
}

// Ids that do not exist anywhere.
const ghost = () => randomUUID()
const newToken = () => randomBytes(16).toString('hex')

// ---------------------------------------------------------------------------
// A. A student must NOT be able to ...
// ---------------------------------------------------------------------------

// If instructor credentials are set, sign in first (read only) to learn how much
// data exists. A student seeing "no rows" only proves the security rules work
// if there were hidden rows to see.
const instructor = createClient(url, anonKey, clientOptions)
const instructorWanted = Boolean(instructorEmail && instructorPassword)
let instructorSignInError = null
const hidden = { known: false, nonActiveSurveys: 0 }
if (instructorWanted) {
  const { error } = await instructor.auth.signInWithPassword({
    email: instructorEmail,
    password: instructorPassword,
  })
  instructorSignInError = error
  if (!error) {
    const { data } = await instructor.from('surveys').select('status')
    if (data) {
      hidden.known = true
      hidden.nonActiveSurveys = data.filter((s) => s.status !== 'active').length
    }
  }
}
function hiddenNote(count, what) {
  if (!hidden.known)
    return `cannot tell whether any ${what} exist without instructor credentials`
  return count === 0
    ? `no ${what} exist, so this proves little`
    : `${count} ${what} exist, so this is a real test`
}

console.log(paint(1, 'Security check against the real Supabase project'))
console.log("Using the public anon key, like a student's browser (no login).")

section('A. Reading what students must not see')

await check('read the responses table', async () =>
  deniedOrEmpty(await student.from('responses').select('id').limit(5)),
)
await check('read the answers table', async () =>
  deniedOrEmpty(await student.from('answers').select('id').limit(5)),
)
await check(
  'read a draft, closed or archived survey from the surveys table',
  async () =>
    deniedOrEmpty(
      await student
        .from('surveys')
        .select('id, status')
        .neq('status', 'active'),
      hiddenNote(hidden.nonActiveSurveys, 'non-active survey(s)'),
    ),
)

// What a student CAN see through the tables must belong to the active survey.
const visibleSurveys = await student
  .from('surveys')
  .select('id, title, public_slug, status')
const activeSurvey = visibleSurveys.data?.find((s) => s.status === 'active')

await check(
  'every survey row a student can read is the active one',
  async () => {
    const { data, error } = visibleSurveys
    if (error) return { ok: false, detail: describe(error) }
    const other = data.filter((s) => s.status !== 'active')
    return other.length === 0
      ? { ok: true, detail: `${data.length} row(s), all active` }
      : {
          ok: false,
          detail: `LEAK: ${other.length} non-active survey(s) visible`,
        }
  },
)
await check(
  'every question a student can read belongs to a visible survey',
  async () => {
    const { data, error } = await student
      .from('questions')
      .select('id, survey_id')
    if (error) return { ok: false, detail: describe(error) }
    const ids = new Set((visibleSurveys.data ?? []).map((s) => s.id))
    const stray = data.filter((q) => !ids.has(q.survey_id))
    return stray.length === 0
      ? { ok: true, detail: `${data.length} question(s)` }
      : {
          ok: false,
          detail: `LEAK: ${stray.length} question(s) of hidden surveys`,
        }
  },
)
await check(
  'every choice a student can read belongs to a visible question',
  async () => {
    const questions = await student.from('questions').select('id')
    const { data, error } = await student
      .from('choices')
      .select('id, question_id')
    if (error || questions.error)
      return { ok: false, detail: describe(error ?? questions.error) }
    const ids = new Set(questions.data.map((q) => q.id))
    const stray = data.filter((c) => !ids.has(c.question_id))
    return stray.length === 0
      ? { ok: true, detail: `${data.length} choice(s)` }
      : {
          ok: false,
          detail: `LEAK: ${stray.length} choice(s) of hidden questions`,
        }
  },
)

section('A. Writing directly to the tables (ids that do not exist)')

await check('insert a response directly', async () =>
  deniedWrite(
    await student
      .from('responses')
      .insert({ survey_id: ghost(), anonymous_token: newToken() })
      .select(),
  ),
)
await check('insert an answer directly', async () =>
  deniedWrite(
    await student
      .from('answers')
      .insert({
        response_id: ghost(),
        question_id: ghost(),
        choice_id: ghost(),
      })
      .select(),
  ),
)
await check('insert a question directly', async () =>
  deniedWrite(
    await student
      .from('questions')
      .insert({
        survey_id: ghost(),
        question_text: 'x',
        question_type: 'true_false',
        position: 1,
      })
      .select(),
  ),
)
await check('insert a choice directly', async () =>
  deniedWrite(
    await student
      .from('choices')
      .insert({ question_id: ghost(), choice_text: 'x', position: 1 })
      .select(),
  ),
)
await check('update a survey', async () =>
  deniedWrite(
    await student
      .from('surveys')
      .update({ title: 'hacked' })
      .eq('id', ghost())
      .select(),
  ),
)
await check('update a survey status to active', async () =>
  deniedWrite(
    await student
      .from('surveys')
      .update({ status: 'active' })
      .eq('id', ghost())
      .select(),
  ),
)
await check('delete a survey', async () =>
  deniedWrite(
    await student.from('surveys').delete().eq('id', ghost()).select(),
  ),
)
await check('delete a response', async () =>
  deniedWrite(
    await student.from('responses').delete().eq('id', ghost()).select(),
  ),
)
await check('update a response', async () =>
  deniedWrite(
    await student
      .from('responses')
      .update({ anonymous_token: 'x' })
      .eq('id', ghost())
      .select(),
  ),
)

section('A. Calling the instructor-only functions (ids that do not exist)')

await check('activate_survey', async () =>
  deniedFunction(
    await student.rpc('activate_survey', { p_survey_id: ghost() }),
  ),
)
await check('close_survey', async () =>
  deniedFunction(await student.rpc('close_survey', { p_survey_id: ghost() })),
)
await check('archive_survey', async () =>
  deniedFunction(await student.rpc('archive_survey', { p_survey_id: ghost() })),
)
await check('save_draft_survey', async () =>
  deniedFunction(
    await student.rpc('save_draft_survey', {
      p_survey_id: ghost(),
      p_title: 'x',
      p_description: null,
      p_questions: [],
    }),
  ),
)
await check('get_survey_results', async () =>
  deniedFunction(
    await student.rpc('get_survey_results', { p_survey_id: ghost() }),
  ),
)
await check('generate_survey_slug (internal helper)', async () =>
  deniedFunction(await student.rpc('generate_survey_slug')),
)

// ---------------------------------------------------------------------------
// B. A student SHOULD be able to ...
// ---------------------------------------------------------------------------

section('B. What students should be able to do')

let publicSurvey = null
if (!activeSurvey?.public_slug) {
  skip(
    'get_public_survey on the active survey',
    'no active survey right now; activate one and run again',
  )
  skip('read the active survey from the surveys table', 'no active survey')
} else {
  await check('read the active survey from the surveys table', async () => ({
    ok: true,
    detail: 'the active survey row is readable',
  }))
  await check(
    'get_public_survey returns the active survey with its questions',
    async () => {
      const { data, error } = await student.rpc('get_public_survey', {
        p_slug: activeSurvey.public_slug,
      })
      if (error) return { ok: false, detail: describe(error) }
      publicSurvey = data
      const good =
        data?.status === 'active' &&
        data.survey?.id === activeSurvey.id &&
        Array.isArray(data.questions) &&
        data.questions.length > 0 &&
        data.questions.every(
          (q) => Array.isArray(q.choices) && q.choices.length > 0,
        )
      return {
        ok: good,
        detail: good
          ? `${data.questions.length} question(s)`
          : `unexpected shape: ${JSON.stringify(data).slice(0, 80)}`,
      }
    },
  )
  await check(
    'get_public_survey exposes no response data or counts',
    async () => {
      if (!publicSurvey)
        return { ok: false, detail: 'no data from the previous check' }
      const extra = []
      const allowed = (obj, keys, where) => {
        for (const key of Object.keys(obj ?? {}))
          if (!keys.includes(key)) extra.push(`${where}.${key}`)
      }
      allowed(publicSurvey, ['status', 'survey', 'questions'], 'result')
      allowed(publicSurvey.survey, ['id', 'title', 'description'], 'survey')
      for (const q of publicSurvey.questions) {
        allowed(
          q,
          ['id', 'question_text', 'question_type', 'position', 'choices'],
          'question',
        )
        for (const c of q.choices)
          allowed(c, ['id', 'choice_text', 'position'], 'choice')
      }
      return extra.length === 0
        ? { ok: true, detail: 'only title, description, questions and choices' }
        : { ok: false, detail: `unexpected field(s): ${extra.join(', ')}` }
    },
  )
}

await check('get_public_survey: unknown slug is "not_found"', async () => {
  const { data, error } = await student.rpc('get_public_survey', {
    p_slug: 'zz-no-such-slug',
  })
  if (error) return { ok: false, detail: describe(error) }
  return data?.status === 'not_found' && Object.keys(data).length === 1
    ? { ok: true, detail: 'status not_found' }
    : { ok: false, detail: JSON.stringify(data).slice(0, 80) }
})
await check(
  'get_public_survey: a malformed slug is "not_found", not an error',
  async () => {
    const { data, error } = await student.rpc('get_public_survey', {
      p_slug: "x'; drop table surveys; --",
    })
    if (error) return { ok: false, detail: describe(error) }
    return data?.status === 'not_found'
      ? { ok: true, detail: 'status not_found' }
      : { ok: false, detail: JSON.stringify(data).slice(0, 80) }
  },
)

section('B. submit_survey_response with bad input gives a clean error code')

const submit = (surveyId, token, answers) =>
  student.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_anonymous_token: token,
    p_answers: answers,
  })

await check('unknown survey -> SURVEY_NOT_ACTIVE', async () =>
  cleanCode('SURVEY_NOT_ACTIVE')(
    await submit(ghost(), newToken(), [
      { question_id: ghost(), choice_id: ghost() },
    ]),
  ),
)

const firstQuestion = publicSurvey?.questions?.[0]
if (!activeSurvey || !firstQuestion) {
  for (const name of [
    'answers is not a list -> INVALID_PAYLOAD',
    'empty answers -> INVALID_PAYLOAD',
    'more than 100 answers -> INVALID_PAYLOAD',
    'answer is not an object -> INVALID_PAYLOAD',
    'token too short -> INVALID_TOKEN',
    'token missing -> INVALID_TOKEN',
    'question id is not a UUID -> INVALID_QUESTION',
    'question not in this survey -> INVALID_QUESTION',
    'choice id is not a UUID -> INVALID_CHOICE',
    'choice not in the question -> INVALID_CHOICE',
  ])
    skip(name, 'needs an active survey; activate one and run again')
} else {
  const sid = activeSurvey.id
  const fakeAnswer = { question_id: ghost(), choice_id: ghost() }
  const cases = [
    [
      'answers is not a list -> INVALID_PAYLOAD',
      newToken(),
      { not: 'a list' },
      'INVALID_PAYLOAD',
    ],
    ['empty answers -> INVALID_PAYLOAD', newToken(), [], 'INVALID_PAYLOAD'],
    [
      'more than 100 answers -> INVALID_PAYLOAD',
      newToken(),
      Array.from({ length: 101 }, () => fakeAnswer),
      'INVALID_PAYLOAD',
    ],
    [
      'answer is not an object -> INVALID_PAYLOAD',
      newToken(),
      ['x'],
      'INVALID_PAYLOAD',
    ],
    [
      'token too short -> INVALID_TOKEN',
      'short',
      [fakeAnswer],
      'INVALID_TOKEN',
    ],
    ['token missing -> INVALID_TOKEN', null, [fakeAnswer], 'INVALID_TOKEN'],
    [
      'question id is not a UUID -> INVALID_QUESTION',
      newToken(),
      [{ question_id: 'not-a-uuid', choice_id: ghost() }],
      'INVALID_QUESTION',
    ],
    [
      'question not in this survey -> INVALID_QUESTION',
      newToken(),
      [fakeAnswer],
      'INVALID_QUESTION',
    ],
    [
      'choice id is not a UUID -> INVALID_CHOICE',
      newToken(),
      [{ question_id: firstQuestion.id, choice_id: 'not-a-uuid' }],
      'INVALID_CHOICE',
    ],
    [
      'choice not in the question -> INVALID_CHOICE',
      newToken(),
      [{ question_id: firstQuestion.id, choice_id: ghost() }],
      'INVALID_CHOICE',
    ],
  ]
  for (const [name, token, answers, code] of cases)
    await check(name, async () =>
      cleanCode(code)(await submit(sid, token, answers)),
    )
}

// ---------------------------------------------------------------------------
// C. As the instructor (only if credentials are in .env)
// ---------------------------------------------------------------------------

section('C. As the instructor')

if (!instructorEmail || !instructorPassword) {
  skip(
    'instructor checks',
    'set TEST_INSTRUCTOR_EMAIL and TEST_INSTRUCTOR_PASSWORD in .env to include them',
  )
} else {
  const signedIn = !instructorSignInError

  await check('sign in as the instructor', async () => ({
    ok: signedIn,
    detail: signedIn
      ? 'signed in'
      : `sign-in failed (${instructorSignInError.status ?? instructorSignInError.name})`,
  }))

  if (!signedIn) {
    skip('the rest of the instructor checks', 'sign-in failed')
  } else {
    for (const table of [
      'surveys',
      'questions',
      'choices',
      'responses',
      'answers',
    ]) {
      await check(`read the ${table} table`, async () => {
        const { count, error } = await instructor
          .from(table)
          .select('id', { count: 'exact', head: true })
        return error
          ? { ok: false, detail: describe(error) }
          : { ok: true, detail: `${count} row(s)` }
      })
    }

    const surveys = await instructor
      .from('surveys')
      .select('id, status, public_slug')
    await check('sees surveys of every status', async () => {
      if (surveys.error) return { ok: false, detail: describe(surveys.error) }
      const byStatus = {}
      for (const s of surveys.data)
        byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
      return { ok: true, detail: JSON.stringify(byStatus) }
    })

    const anySurvey = surveys.data?.[0]
    if (!anySurvey) {
      skip('get_survey_results on a real survey', 'no surveys exist yet')
    } else {
      await check(
        'get_survey_results on a real survey (read only)',
        async () => {
          const { data, error } = await instructor.rpc('get_survey_results', {
            p_survey_id: anySurvey.id,
          })
          if (error) return { ok: false, detail: describe(error) }
          const good =
            typeof data?.response_count === 'number' &&
            Array.isArray(data.questions)
          return {
            ok: good,
            detail: good
              ? `${data.response_count} response(s)`
              : 'unexpected shape',
          }
        },
      )
    }

    // With an id that does not exist these fail with "not found" - which proves
    // the instructor passed the permission check - and change nothing.
    const notFound = async (name, call) =>
      check(
        `${name} is permitted (id does not exist, so nothing changes)`,
        async () => cleanCode('SURVEY_NOT_FOUND')(await call()),
      )
    await notFound('activate_survey', () =>
      instructor.rpc('activate_survey', { p_survey_id: ghost() }),
    )
    await notFound('close_survey', () =>
      instructor.rpc('close_survey', { p_survey_id: ghost() }),
    )
    await notFound('archive_survey', () =>
      instructor.rpc('archive_survey', { p_survey_id: ghost() }),
    )
    await notFound('get_survey_results', () =>
      instructor.rpc('get_survey_results', { p_survey_id: ghost() }),
    )
    await notFound('save_draft_survey', () =>
      instructor.rpc('save_draft_survey', {
        p_survey_id: ghost(),
        p_title: 'x',
        p_description: null,
        p_questions: [],
      }),
    )

    // A closed or archived survey's link must tell a student only "closed".
    const finished = surveys.data?.find(
      (s) =>
        (s.status === 'closed' || s.status === 'archived') && s.public_slug,
    )
    if (!finished) {
      skip(
        'a closed survey\'s link shows students only "closed"',
        'no closed survey with a link yet',
      )
    } else {
      await check(
        'a closed survey\'s link shows students only "closed"',
        async () => {
          const { data, error } = await student.rpc('get_public_survey', {
            p_slug: finished.public_slug,
          })
          if (error) return { ok: false, detail: describe(error) }
          const good =
            data?.status === 'closed' && Object.keys(data).length === 1
          return {
            ok: good,
            detail: good
              ? 'status closed, no content'
              : JSON.stringify(data).slice(0, 80),
          }
        },
      )
    }

    await instructor.auth.signOut()
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const count = (status) => results.filter((r) => r.status === status).length
const failed = results.filter((r) => r.status === 'FAIL')
console.log(
  `\n${paint(1, 'Summary:')} ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`,
)
if (failed.length > 0) {
  console.log(paint(31, '\nFAILED checks:'))
  for (const r of failed) console.log(`  - ${r.name}`)
  console.log(
    '\nA FAIL in section A means something a student must not do is possible: re-run supabase/002_rls.sql and 003_functions.sql. Other FAILs: see the detail on each line.',
  )
}
process.exit(failed.length > 0 ? 1 : 0)
