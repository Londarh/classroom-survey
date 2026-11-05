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

## Results and CSV export decisions

21. **The CSV has no extra rows: survey title and date go in the file name.**
    The file name is the survey title (lowercased, punctuation turned into dashes) plus the export date, for example `recursion-concept-check-2026-11-05.csv`. This keeps the header on row 1, so the file opens as a clean table and imports into other tools without skipping lines. `TODO.md` previously said "export survey metadata"; the file name is that metadata.

22. **CSV layout: one row per response, one column per question.**
    The first two columns are `response_id` and `submitted_at` (UTC, ISO format). Each question then has a column whose header is the question text and whose cell is the text of the choice picked (empty if unanswered, or if the choice was later deleted). The anonymous browser token is deliberately not exported.

23. **Spreadsheet-formula protection and standard CSV quoting.**
    A cell that starts with `=`, `+`, `-` or `@` (or a tab or carriage return) gets a single quote in front so Excel and Sheets treat it as text, not a formula; this applies to headers too. Cells with commas, double quotes or line breaks are wrapped in quotes with inner quotes doubled; rows end with CRLF. The file starts with a UTF-8 byte-order mark so Excel reads accents and non-English text correctly.

24. **The export pages through every row.**
    One request returns at most 1000 rows, so responses and answers are fetched page by page (ordered by time, then id, so pages never overlap) until the server's reported total is reached or a page comes back empty. This also works if the server's limit is lower than the page size.

25. **Results page.**
    Each bar's length is the choice's share of that question's answers, and the count and percentage are printed beside every bar (and repeated in a screen-reader table), so nothing depends on colour. A question with no answers says "No answers yet."; a survey with no responses says "No responses yet." (with a Present QR button while it is active) and has Export CSV disabled. Results work for active, closed and archived surveys, and the dashboard shows a Results button for those three. The results page is loaded on demand so students opening a survey do not download the charting library.

---

## Duplicate and polish decisions

26. **Duplicate works on a survey in any status and goes through `save_draft_survey`.**
    The copy is a new draft titled "Copy of <title>" (cut to the 200-character title limit) with the same description, questions and choices, and no responses; the editor then opens on it. The copy is saved like any other draft, so the same validation applies and nothing is half-copied if it fails.

27. **Confirmations stay inline, and keyboard focus follows them.**
    Delete, archive and close confirmations (and "delete question") open in place rather than as modal pop-ups, in line with `UI.md` ("avoid excessive modal dialogs"). Because the button that opened one disappears, focus moves to the confirmation's Cancel button, and returns to the opening button if it is cancelled.

28. **Error jumps are instant, not animated, and run after the errors are drawn.**
    When saving or submitting finds problems, the page jumps straight to the first one and focuses it. No scrolling animation is used (`UI.md` says to avoid decorative animation, and a long animated scroll is disorienting). The editor does this from an effect, because after a network call React draws the new messages a moment later.

29. **Page titles, placeholder contrast and 44px targets.**
    Each page sets a descriptive browser-tab title; input placeholder text uses a darker slate (about 4.8:1 against white) than Tailwind's default; and every button, field and text link is at least 44px tall.

---

## Deployment decisions

30. **Hosted as a Cloudflare Worker with static assets; page routing is set in `wrangler.jsonc`, not `_redirects`.**
    The usual single-page-app rule (`/* /index.html 200` in `public/_redirects`) made Cloudflare's deploy fail with "Invalid _redirects configuration: Infinite loop detected in this rule", because this project deploys as a Worker with static assets rather than as a Pages site. So `public/_redirects` was deleted, and `wrangler.jsonc` (project name `classroom-survey`) serves the `dist` folder with `"not_found_handling": "single-page-application"`. A request that matches a built file is served as that file; anything else gets `index.html`, and React Router shows the page. Refreshing on `/login`, `/dashboard` or a student link `/s/<slug>` therefore works. There is no Worker script.

31. **Consequences of that routing.**
    Unknown addresses are answered with `index.html` and a normal 200 status, and the app's own "Page not found" screen explains it, so the server never sends a real HTTP 404 for a page. The `compatibility_date` in `wrangler.jsonc` is pinned (2026-11-04); for a site that is only static files it does not change behaviour and rarely needs updating. The `VITE_` settings are compiled into the site, so they must be set as Cloudflare **build** variables, and changing one needs a new build.

---

## Still open (to decide when we reach them)

- **QR code origin:** generate it from `window.location.origin`, with an optional environment-variable override for testing on a phone.
- **Supabase free tier:** projects pause after about a week of inactivity, so confirm the project is awake before grading.
