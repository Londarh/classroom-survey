# Design Decisions

Decisions made while reviewing the specification files in `docs/`. Where the docs disagree or leave something open, this file is the tie-breaker. The assignment asks that any design decision not explicitly covered by the specs be documented; this is that record.

---

## Agreed decisions

1. **Student route is `/s/:slug`.**
   `DATABASE.md`, `API.md`, `UI.md` and the spec all use the slug, and `surveys.public_slug` exists for it. A short slug makes a simpler, more reliably scannable QR code and a readable fallback URL. It also keeps the public identifier separate from the internal UUID used in instructor routes. `TODO.md` previously said `:surveyId`; it has been corrected.

2. **Only draft surveys can be edited.**
   Editing questions or choices after responses exist is destructive: deleting a question cascades to its answers, and deleting a choice sets `answers.choice_id` to null. The assignment also says "edit existing draft surveys". To reuse a closed survey, duplicate it.

3. **Students never insert directly; submissions go only through the `submit_survey_response` RPC.**
   The RPC checks that the survey is active, that questions and choices belong to it, and that the browser token has not already submitted, then inserts the response and answers in one transaction. No `INSERT` policies are created for `anon` on `responses` or `answers`.

4. **A small `get_public_survey(slug)` function serves the student page.**
   RLS only lets `anon` read active surveys, so a closed survey's slug would look like "not found". The function returns the survey status so the student sees "This survey is no longer accepting responses" instead.

5. **Status changes go through RPCs, not plain updates.**
   Activating and closing use `activate_survey` and `close_survey`, which enforce the one-active-survey rule and the slug generation. Archiving is the only other status change. `API.md` previously let the client write `status` and `public_slug` directly.

6. **Status transitions: draft → active → closed → archived.**
   A survey must be closed before it is archived. A closed or archived survey is not reactivated; duplicate it instead. This keeps response data attached to exactly one run of a survey.

7. **Instructor access: public signups are disabled and the instructor account is created manually.**
   The single-instructor policies grant full access to any authenticated user. That is only safe if nobody else can register.

8. **All questions are required.**
   There is no `required` column. `MISSING_REQUIRED_ANSWER` is raised if any question is unanswered. "Unanswered" on the results page means a question with zero responses.

9. **True/False questions are stored as two real rows in `choices` ("True" and "False").**
   The submission function and the results query both depend on `choices` rows, so True/False questions need them. The editor creates them automatically.

10. **The present page polls for the response count every few seconds.**
    Realtime updates are post-MVP, so polling is the simplest way to keep the count live.

11. **The database schema lives in SQL files under `supabase/`.**
    The assignment requires migration or schema files in the repository, so tables, indexes, triggers, RLS policies and RPCs are written as SQL files rather than clicked together in the dashboard.

12. **`DATABASE.md` is authoritative for the schema.**
    The schema in the main specification (§6) is an earlier, shorter version without `public_slug`, `updated_at` and some `created_at` columns.

---

## Still open (to decide when we reach them)

- **RPC permissions:** `anon` can call public-schema functions by default. `activate_survey`, `close_survey` and any results RPC need an explicit auth check or a revoked grant. A results view must be created with `security_invoker`.
- **RPC error contract:** raise exceptions carrying the codes in `API.md` (`SURVEY_NOT_ACTIVE`, `DUPLICATE_RESPONSE`, ...) and map them to friendly messages in React, versus returning `{success: false}`.
- **QR code origin:** generate it from `window.location.origin`, with an optional environment-variable override for testing on a phone.
- **Editor save atomicity:** saving a survey writes to three tables; decide between sequential client calls and a single RPC.
- **Supabase free tier:** projects pause after about a week of inactivity, so confirm the project is awake before grading.
