# Testing

What has been tested, how, and the result. Status is stated plainly: a check is only marked tested if it was really run, and the source is given (a script run, my own checks in a browser, or something the instructor reported working). Anything else is listed as not yet tested, with the steps to do it.

Last updated: 2026-11-04.

---

## 1. Automated security check (`npm run check:security`)

[`scripts/check-security.mjs`](../scripts/check-security.mjs) talks to the **real Supabase project**. First it acts like a student's browser: only the public anon key from `.env`, nobody logged in. It tries things a student must not be able to do, and things a student should be able to do. If `TEST_INSTRUCTOR_EMAIL` and `TEST_INSTRUCTOR_PASSWORD` are set in `.env`, it then signs in as the instructor and checks read access and function permissions. It prints PASS, FAIL or SKIP for each check.

**It cannot change real data.** Every write targets a random id that does not exist (an update or delete matches nothing; an insert would fail its foreign key). The submit tests send only invalid answers, and the database function is atomic, so nothing is stored. The instructor-function calls also use ids that do not exist. It refuses to run if the key in `.env` is not an anon/publishable key, never prints keys or passwords, and has no keys in the file.

### Runs

| Date       | Run by | Conditions                                                          | Result                                  |
| ---------- | ------ | ------------------------------------------------------------------- | --------------------------------------- |
| 2026-11-04 | me     | Anon key only; no survey active; no instructor credentials          | 24 passed, 0 failed, 13 skipped         |
| 2026-11-04 | you    | An active survey and the instructor login (credentials in `.env`)   | **51 passed, 0 failed, 0 skipped**      |

The second run is the one that counts. It was run by you and reported to me; I have not seen its line-by-line output. Zero skipped means every check ran, including the ones that need an active survey, and the instructor section.

### What the 51 checks cover

| Group                       | Checks                                                                                                                                                                                                                                                                                                      | Count |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Student: reading            | Read `responses` and `answers` (refused); read draft/closed/archived surveys (nothing returned); every survey, question and choice a student can read belongs to the active survey                                                                                                                         | 6     |
| Student: writing            | Insert a response, answer, question or choice directly; update a survey's title; set a survey's status to active; delete a survey; update and delete a response (all refused with `permission denied`)                                                                                                    | 9     |
| Student: instructor functions | `activate_survey`, `close_survey`, `archive_survey`, `save_draft_survey`, `get_survey_results`, and the internal `generate_survey_slug` (all refused with `permission denied for function`)                                                                                                              | 6     |
| Student: allowed            | `get_public_survey` on the active survey returns the title, questions and choices only (no response data or counts); the active survey is readable from the table; unknown and malformed slugs give `not_found`; a survey that does not exist gives `SURVEY_NOT_ACTIVE`                                  | 5     |
| Student: bad submissions    | Ten invalid payloads each give the right short code, never a raw database error: not a list, empty, over 100 answers, answer not an object (`INVALID_PAYLOAD`); token too short or missing (`INVALID_TOKEN`); question id not a UUID, question not in the survey (`INVALID_QUESTION`); choice id not a UUID, choice not in the question (`INVALID_CHOICE`) | 10    |
| Instructor                  | Sign in; read all five tables; see surveys of every status; `get_survey_results` on a real survey; `activate_survey`, `close_survey`, `archive_survey`, `save_draft_survey` and `get_survey_results` are permitted (on an id that does not exist, so they fail with "not found" and change nothing); a closed survey's link shows students only `closed` | 14    |
| **Total**                   |                                                                                                                                                                                                                                                                                                             | **51** |

Written to the database by the script: nothing.

### What this proves

- **Students cannot read results or hidden data.** The responses and answers tables are refused outright, and the instructor-only results function is refused.
- **Students cannot write anything directly**, and cannot call any instructor function. This is the permission layer under the row-level security rules, and it held for every table and function.
- **Row-level security works for the data students may see.** Students can read the active survey, and everything they can read through the tables belongs to it. Because the closed-survey check did not skip, at least one closed or archived survey with a link existed, so the "no rows for hidden surveys" check was a real test and not an empty database. (This is an inference from the zero skips, not something I saw directly.)
- **The instructor can read every table and call every instructor function.**
- **A student's bad input gets a clean error code**, which the student page turns into a friendly message.

### What it does not cover

- **Successful submissions, duplicate protection and result correctness.** These would need the script to write data, or to compare against it. Real submissions were tested by hand (section 2).
- **Instructor writes through the table rules** (creating, editing and deleting directly). The script only reads as the instructor and calls the instructor functions with ids that do not exist. Creating, editing, duplicating and deleting from the app were used by you by hand.
- **Load.** The specification asks for 200 simultaneous students; nothing here tests that.
- **The deployed site.** The run was against the real database from a local computer.
- **A snapshot in time.** Run it again after any change to the SQL files, and before submitting.

---

## 2. Manual test checklist (TODO Phase 14)

Status key: **Tested** = really run. **Reported** = you told me it works while testing it yourself; I did not independently repeat it. **Not tested** = not run yet.

| TODO item                       | How to test                                                                                                                                  | Status                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructor login                | Log in with the instructor account; log out; try a wrong password; open `/dashboard` while logged out                                        | **Tested / Reported.** Login and dashboard working (you reported). Wrong password shows "Incorrect email or password." and logged-out access to `/dashboard` redirects to `/login` (I checked both in the browser). |
| Survey creation                 | Create a survey with both question types, save, reload, check rows in the Supabase Table Editor                                              | **Reported.** You created surveys; the stuck "Saving..." bug you found was fixed and re-confirmed.                                                                                                                  |
| Survey editing                  | Open a draft, change text, add/remove/move questions and choices, save, reload                                                               | **Not tested** with real data (only with mocked responses during development).                                                                                                                                      |
| Activation                      | Activate from the dashboard and from the editor; check the present page; activate a second survey and confirm the first closes              | **Not tested** separately. (The security run needed an active survey, so activation worked at least once.)                                                                                                          |
| Closing surveys                 | Close from the present page and from the dashboard; the student link then says "no longer accepting responses"                              | **Not tested** separately. (The security run confirmed a closed survey's link shows students only `closed`.)                                                                                                        |
| QR-code links                   | Scan the QR code on a phone (set `VITE_PUBLIC_BASE_URL` to the computer's network address while developing) and confirm it opens the survey | **Not tested.**                                                                                                                                                                                                     |
| Student submissions             | Submit answers on the student page; check a `responses` row and its `answers` rows                                                           | **Reported.** You confirmed real submissions work.                                                                                                                                                                  |
| Duplicate-submission prevention | Submit, reload (should say already submitted); clear site data and submit again (the server should refuse with the same message)             | **Not tested** with the real database. Verified in the browser only with mocked responses.                                                                                                                          |
| Results calculations            | Compare the results page with a query on the Table Editor (see below)                                                                        | **Not tested** numerically; you reported the page works with real data.                                                                                                                                             |
| CSV export                      | Export, open in Excel and Google Sheets; add a choice named `=1+1` and confirm it shows as text                                              | **Not tested** in a spreadsheet. Escaping and paging verified by unit checks and a mocked 2,300-response export.                                                                                                    |
| Mobile layout                   | Student page, dashboard and editor on a real phone                                                                                           | **Not tested** on a real phone.                                                                                                                                                                                     |
| Two browsers                    | Repeat the main flow in Chrome and another browser (Firefox or Edge)                                                                         | **Not tested.**                                                                                                                                                                                                     |
| Unauthorized access attempts    | Section 1 above                                                                                                                              | **Tested.** Security check run, 51 passed, 0 failed, 0 skipped.                                                                                                                                                     |
| Database Row Level Security     | Section 1 above, with an active survey and instructor credentials                                                                            | **Tested.** Same run; see "What this proves" and "What it does not cover" above.                                                                                                                                    |

Also tested by hand (not a Phase 14 item):

| Feature          | How to test                                                                                                                      | Status                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Duplicate survey | Press Duplicate on a survey of any status; the editor opens on "Copy of ..." with the same description, questions and choices | **Reported.** You tested it by hand; I tested it in the browser against mocked responses only. |

To compare a question's results with the database, run this in the SQL Editor (use the question's id from the `questions` table):

```sql
select c.choice_text, count(a.id) as answers
from choices c
left join answers a on a.choice_id = c.id
where c.question_id = '<question id>'
group by c.id, c.choice_text, c.position
order by c.position;
```

---

## 3. Keyboard, confirmations and accessibility (TODO Phase 13)

| Check                                                                                                                   | Status                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Every form control and button has an accessible name; one heading level 1 and one main area per page; headings in order | **Tested** on every page (script in the browser, against mocked data)                                    |
| Every focusable element has a visible focus style; a real Tab press showed a 2px outline                                | **Tested**                                                                                               |
| Text contrast on every page (lowest measured 7.58:1; placeholder text fixed)                                            | **Tested**                                                                                               |
| Focus moves into a confirmation and returns to the opening button on cancel                                             | **Tested** by me (browser, mocked data) and **Reported** by you (by hand)                                |
| Delete, archive and close confirmations (including the stronger warning when a survey has responses)                    | **Tested** by me (browser, mocked data) and **Reported** by you (by hand)                                |
| Using the app with the keyboard only                                                                                    | **Reported.** You tested keyboard navigation by hand.                                                    |
| A screen reader                                                                                                         | **Not tested**                                                                                           |

The keyboard walk-through you followed: Tab through the dashboard and open a delete confirmation (focus lands on Cancel; Cancel returns it to Delete); in the editor, save with an empty title (focus lands in the title field); on a student link, submit with an answer missing (focus lands on the first unanswered question); use every button on the present and results pages.

---

## 4. Other checks done while building

- **Logic checks** with throwaway scripts (not kept in the repo): form validation and moving items in the editor, the CSV escaping rules (commas, quotes, line breaks, formula-looking cells), file names, page titles, and the "Copy of" title.
- **Browser checks against mocked database responses** (a fake local login and replaced network calls, so real data was never touched): the editor, activation, present page, student form and its messages, duplicate handling, results and chart layout, CSV export of 2,300 responses with the server limited to 1,000 and then 400 rows per request, and every dashboard state.
- **Bugs found this way and fixed:** the editor staying on "Saving..." after a first save; stale data when moving between surveys' present and results pages; the editor error banner pointing the wrong way and not jumping to the problem.

Not covered by any of the above: real submissions at class scale and the deployed site; both belong to the deployment phase.
