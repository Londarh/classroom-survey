# Supabase database

SQL for the Classroom Survey database. Design background: [../docs/DATABASE.md](../docs/DATABASE.md), [../docs/API.md](../docs/API.md) and [../DECISIONS.md](../DECISIONS.md).

## How to run it

In your Supabase project open **SQL Editor**, then paste and run each file **in this order**, one at a time. Each should finish with "Success".

| #   | File                                   | What it does                                                                                                      |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | [001_schema.sql](001_schema.sql)       | Tables, indexes, the `updated_at` trigger, and the "only one active survey" rule.                                 |
| 2   | [002_rls.sql](002_rls.sql)             | Row Level Security: who can read/write which rows. Students read only the active survey; the instructor does all. |
| 3   | [003_functions.sql](003_functions.sql) | The functions the app calls: save draft, activate, close, archive, public lookup, submit, results.                |

The files are safe to run again if you change something (they use `if not exists` / `or replace`). Do not skip 002: until it runs, anyone holding the public key can read and write the tables.

## Then set up the instructor account

1. **Authentication → Users → Add user**: create the instructor with an email and password (tick auto-confirm). Do not commit these credentials anywhere.
2. In the Authentication settings, **turn off "Allow new users to sign up"** and make sure **anonymous sign-ins** are off. The instructor account has full access, so nobody else may be able to register. (Menu names change over time; look for the sign-up and anonymous toggles under Sign In / Providers.)

## The functions

| Function                                                      | Who can call      | Purpose                                                                    |
| ------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| `save_draft_survey(survey_id, title, description, questions)` | instructor        | Create/overwrite a draft with all questions and choices in one transaction |
| `activate_survey(survey_id)`                                  | instructor        | draft → active; closes the previous one; creates the slug                  |
| `close_survey(survey_id)`                                     | instructor        | active → closed                                                            |
| `archive_survey(survey_id)`                                   | instructor        | draft or closed → archived                                                 |
| `get_survey_results(survey_id)`                               | instructor        | Counts and percentages per choice                                          |
| `get_public_survey(slug)`                                     | anyone (students) | Active survey for `/s/<slug>`, or status `closed` / `not_found`            |
| `submit_survey_response(survey_id, anonymous_token, answers)` | anyone (students) | The only way a student writes data                                         |

Call them from the app with `supabase.rpc('function_name', { p_survey_id: ... })`. The parameter names start with `p_` (for example `p_survey_id`, `p_answers`).

## Error codes

Functions fail with an exception whose **message** is one of these codes (`error.message` in supabase-js). Some also carry a human-readable `error.details`. The app should map them to friendly text and never show raw database errors to students.

| Code                        | From                       | Meaning                                                 |
| --------------------------- | -------------------------- | ------------------------------------------------------- |
| `SURVEY_NOT_ACTIVE`         | submit                     | Survey is closed, not active, or does not exist         |
| `DUPLICATE_RESPONSE`        | submit                     | This browser already submitted to this survey           |
| `INVALID_QUESTION`          | submit                     | A question is not in this survey, or is answered twice  |
| `INVALID_CHOICE`            | submit                     | A choice does not belong to its question, or is missing |
| `MISSING_REQUIRED_ANSWER`   | submit                     | A question was left unanswered                          |
| `INVALID_TOKEN`             | submit                     | Browser token missing or malformed                      |
| `INVALID_PAYLOAD`           | submit                     | Answers are not a valid non-empty list                  |
| `NOT_AUTHORIZED`            | instructor functions       | Caller is not the logged-in instructor                  |
| `SURVEY_NOT_FOUND`          | instructor functions       | No survey with that id                                  |
| `SURVEY_NOT_EDITABLE`       | save_draft_survey          | Only drafts can be edited                               |
| `INVALID_STATUS_TRANSITION` | activate / close / archive | That status change is not allowed                       |
| `SURVEY_INCOMPLETE`         | activate                   | Needs 1+ question and 2+ choices on every question      |
| `ACTIVATION_CONFLICT`       | activate                   | Two surveys were activated at the same moment; retry    |
| `VALIDATION_ERROR`          | save_draft_survey          | Bad title/question/choice; `error.details` says which   |

Instructor functions called without being logged in as the instructor fail with `permission denied for function ...` before they even run; `NOT_AUTHORIZED` is a second lock behind that.

## What to check after running the files

Everything below runs in the SQL Editor. Run each block on its own. The editor runs as the `postgres` owner, so the `set local role` lines pretend to be a student or the instructor for that block only.

**1. All five tables exist and RLS is on.** Expect five rows, all `true`.

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

**2. Who may run which function.** Expected: `anon` is `true` only for `get_public_survey`, `submit_survey_response` (and the harmless `is_instructor` and trigger function `update_updated_at_column`). `authenticated` is `true` for the instructor functions too. `generate_survey_slug` is `false` for both.

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by p.proname;
```

**3. A student cannot read responses.** Expected: `permission denied for table responses`.

```sql
begin;
set local role anon;
select count(*) from public.responses;
rollback;
```

**4. A student cannot call instructor functions.** Expected: `permission denied for function activate_survey`.

```sql
begin;
set local role anon;
select public.activate_survey('00000000-0000-0000-0000-000000000000');
rollback;
```

**5. A student sees no surveys while none is active.** Expected: `0` and no error.

```sql
begin;
set local role anon;
select count(*) from public.surveys;
rollback;
```

**6. The instructor can save a draft.** Expected: JSON like `{"id": "...", "status": "draft"}`. The `rollback` throws the test survey away. (This pretends to be a logged-in instructor with a fake login token.)

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.save_draft_survey(
  null, 'Test survey', 'Just a test',
  '[{"question_text":"2 + 2 = ?","question_type":"multiple_choice",
     "choices":[{"choice_text":"3"},{"choice_text":"4"}]},
    {"question_text":"The sky is blue.","question_type":"true_false"}]'::jsonb);
rollback;
```

**7. The same call without the instructor login is refused.** Expected: `NOT_AUTHORIZED`.

```sql
begin;
select public.save_draft_survey(null, 'x', null, '[]'::jsonb);
rollback;
```

A student really submitting, duplicates being rejected, results adding up and the instructor reading everything need the app or real tokens. The script `npm run check:security` covers the security side (see the main [README](../README.md#security-check) and [../docs/TESTING.md](../docs/TESTING.md)); the rest was tested by hand.

## Starting over

To wipe the database objects and re-run 001 to 003 from scratch (this deletes all data):

```sql
drop table if exists public.answers, public.responses, public.choices,
                     public.questions, public.surveys cascade;
drop function if exists public.is_instructor();
drop function if exists public.generate_survey_slug();
drop function if exists public.update_updated_at_column();
drop function if exists public.save_draft_survey(uuid, text, text, jsonb);
drop function if exists public.activate_survey(uuid);
drop function if exists public.close_survey(uuid);
drop function if exists public.archive_survey(uuid);
drop function if exists public.get_public_survey(text);
drop function if exists public.submit_survey_response(uuid, text, jsonb);
drop function if exists public.get_survey_results(uuid);
```
