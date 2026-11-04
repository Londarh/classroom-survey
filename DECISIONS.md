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
   Activating and closing use `activate_survey` and `close_survey`, which enforce the one-active-survey rule and the slug generation. Archiving (`archive_survey`) is the only other status change. `API.md` previously let the client write `status` and `public_slug` directly. The database does not stop the instructor account from updating those columns by hand (the instructor is trusted); the app simply never does.

6. **Status transitions: draft → active → closed → archived.**
   An active survey must be closed before it is archived; draft and closed surveys can be archived directly (`UI.md` shows an Archive button on draft cards). A closed or archived survey is not reactivated; duplicate it instead. This keeps response data attached to exactly one run of a survey.

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

## Database decisions (written with `supabase/*.sql`)

13. **"Instructor" means a real, non-anonymous login, checked by `is_instructor()`.**
    `DATABASE.md` suggests `using (true)` for the `authenticated` role. But Supabase can also issue _anonymous_ sign-ins that count as `authenticated`. `is_instructor()` also requires that the login is not anonymous, and every instructor policy and function uses it. Combined with disabled signups (#7), only the account created by hand has instructor power.

14. **Instructor functions are locked twice.**
    Supabase lets `anon` execute any `public` function by default, so each instructor function explicitly revokes `EXECUTE` from `public`, `anon` and `authenticated` and grants it back to `authenticated` only. Each also checks `is_instructor()` inside (error `NOT_AUTHORIZED`). Resolves the earlier open item on RPC permissions.

15. **Table privileges are revoked from `anon`, on top of RLS.**
    `anon` keeps only `SELECT` on `surveys`, `questions` and `choices`, and nothing at all on `responses` and `answers`. Even a mistaken policy later could not give students write access.

16. **Errors are exceptions whose message is a code.**
    Functions `raise exception 'SURVEY_NOT_ACTIVE'` (etc.); the app reads `error.message` and maps it to friendly text. Resolves the earlier open item on the RPC error contract. Beyond the codes in `API.md`, the functions also use `INVALID_TOKEN`, `INVALID_PAYLOAD`, `NOT_AUTHORIZED`, `SURVEY_NOT_FOUND`, `SURVEY_NOT_EDITABLE`, `INVALID_STATUS_TRANSITION`, `SURVEY_INCOMPLETE`, `ACTIVATION_CONFLICT` and `VALIDATION_ERROR` (see `supabase/README.md`).

17. **Saving a draft is one function, `save_draft_survey`.**
    It writes the survey, questions and choices in a single transaction, so a failed save leaves nothing half-written; array order becomes `position`, so reordering needs no extra calls. It replaces a draft's questions each time, which is safe because drafts have no responses. Resolves the earlier open item on editor save atomicity.

18. **Activation requires a complete survey.**
    `activate_survey` needs at least one question and at least two choices on every question. Drafts may be saved incomplete (work in progress). Activating an already-active survey just returns it, so a double click is harmless.

19. **`get_public_survey` reveals as little as possible.**
    Active surveys return their questions and choices. Closed and archived surveys return only `{"status": "closed"}` (no title or content); unknown slugs and never-activated drafts return `not_found`. The direct `anon` read policies from `DATABASE.md` are kept as a backstop, but the student page uses this function.

20. **`get_survey_results` returns the `API.md` shape plus `title`, `status` and `question_type`.**
    Percentages are per question (choice count divided by that question's answers, one decimal, `0` when unanswered). Every choice is listed even with a count of 0.

---

## Still open (to decide when we reach them)

- **QR code origin:** generate it from `window.location.origin`, with an optional environment-variable override for testing on a phone.
- **Supabase free tier:** projects pause after about a week of inactivity, so confirm the project is awake before grading.
