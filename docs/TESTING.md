# Testing

What has been tested, how, and the result. Status is stated plainly: a check is only marked tested if it was really run, and the source is given (my own script run, or something the instructor reported working). Anything else is listed as not yet tested, with the steps to do it.

Last updated: 2026-11-04.

---

## 1. Automated security check (`npm run check:security`)

[`scripts/check-security.mjs`](../scripts/check-security.mjs) talks to the **real Supabase project** the way a student's browser does: only the public anon key from `.env`, nobody logged in. It tries things a student must not be able to do, and things a student should be able to do, and prints PASS, FAIL or SKIP for each.

**It cannot change real data.** Every write targets a random id that does not exist (an update or delete matches nothing; an insert would fail its foreign key). The submit tests send only invalid answers, and the database function is atomic, so nothing is stored. It refuses to run if the key in `.env` is not an anon/publishable key, never prints keys or passwords, and has no keys in the file.

Optional: set `TEST_INSTRUCTOR_EMAIL` and `TEST_INSTRUCTOR_PASSWORD` in `.env` to also check read access as the instructor. Without them that part is skipped.

### Result of the run on 2026-11-04

**24 passed, 0 failed, 13 skipped.** (Anon key only; no instructor credentials were set; no survey was active at the time.)

| Group | Check | Result |
| --- | --- | --- |
| Reading | Read `responses` | PASS: `permission denied for table responses` |
| Reading | Read `answers` | PASS: `permission denied for table answers` |
| Reading | Read draft / closed / archived surveys from `surveys` | PASS: no rows (see "Limits" below) |
| Reading | Every survey, question and choice a student can read belongs to the active survey | PASS: 0 rows visible (no active survey at the time) |
| Writing | Insert a response, answer, question or choice directly | PASS (4 checks): all `permission denied` |
| Writing | Update a survey's title, set a survey's status to active, delete a survey | PASS (3 checks): all `permission denied for table surveys` |
| Writing | Update or delete a response | PASS (2 checks): `permission denied for table responses` |
| Functions | `activate_survey`, `close_survey`, `archive_survey`, `save_draft_survey`, `get_survey_results` | PASS (5 checks): all `permission denied for function ...` |
| Functions | `generate_survey_slug` (internal helper) | PASS: `permission denied` |
| Student | `get_public_survey` with an unknown slug | PASS: `not_found` |
| Student | `get_public_survey` with a malformed slug (`x'; drop table surveys; --`) | PASS: `not_found`, not an error |
| Student | `submit_survey_response` for a survey that does not exist | PASS: clean code `SURVEY_NOT_ACTIVE` |
| Student | `get_public_survey` on the active survey; the active survey readable from the table | SKIP: no active survey |
| Student | Bad submissions give clean codes: not a list, empty, over 100 answers, answer not an object (`INVALID_PAYLOAD`); token too short or missing (`INVALID_TOKEN`); bad question id, question from another survey (`INVALID_QUESTION`); bad choice id, choice not in the question (`INVALID_CHOICE`) | SKIP (10 checks): these need an active survey |
| Instructor | Sign in, read every table, see every status, call the instructor functions, closed-survey link shows only "closed" | SKIP: no credentials set |

Written to the database: nothing.

### Limits of this run (read before trusting it)

- **"Returned no rows" proves little here.** The check for reading non-active surveys passed because it returned nothing, but without instructor credentials the script cannot tell whether any draft or closed surveys existed to hide. The script now says so on that line. The checks that were refused outright (`permission denied`, which is every table write and every instructor function) do not have this weakness.
- **Row-level security itself is only partly proven.** With no active survey, nothing shows that students *can* read the active survey while the others stay hidden. The permission layer underneath (table privileges and function grants) is proven.
- **Ten submit checks and the instructor section did not run.**
- A successful submission, duplicate protection across browsers, and result correctness are not covered by the script (they would need to write data, or to compare against it).

### To complete the run

1. In the app, activate a survey that has at least one question (a draft you do not mind exposing for a minute).
2. Add `TEST_INSTRUCTOR_EMAIL` and `TEST_INSTRUCTOR_PASSWORD` to `.env` (the instructor account you created in Supabase; `.env` is git-ignored).
3. Run `npm run check:security` again. It should have no SKIP lines except possibly "a closed survey's link" if no closed survey with a link exists yet. Make sure at least one draft or closed survey exists, so the "no rows" check says "N non-active survey(s) exist, so this is a real test".
4. Paste the new summary into this file.

---

## 2. Manual test checklist (TODO Phase 14)

Status key: **Tested** = really run. **Reported** = you told me it works while testing it yourself; I did not independently repeat it. **Not tested** = not run yet.

| TODO item | How to test | Status |
| --- | --- | --- |
| Instructor login | Log in with the instructor account; log out; try a wrong password; open `/dashboard` while logged out | **Tested / Reported.** Login and dashboard working (you reported). Wrong password shows "Incorrect email or password." and logged-out access to `/dashboard` redirects to `/login` (I checked both in the browser). |
| Survey creation | Create a survey with both question types, save, reload, check rows in the Supabase Table Editor | **Reported.** You created surveys; the stuck "Saving..." bug you found was fixed and re-confirmed. |
| Survey editing | Open a draft, change text, add/remove/move questions and choices, save, reload | **Not tested** with real data (only with mocked responses during development). |
| Activation | Activate from the dashboard and from the editor; check the present page; activate a second survey and confirm the first closes | **Not tested** separately. |
| Closing surveys | Close from the present page and from the dashboard; the student link then says "no longer accepting responses" | **Not tested** separately. |
| QR-code links | Scan the QR code on a phone (set `VITE_PUBLIC_BASE_URL` to the computer's network address while developing) and confirm it opens the survey | **Not tested.** |
| Student submissions | Submit answers on the student page; check a `responses` row and its `answers` rows | **Reported.** You confirmed real submissions work. |
| Duplicate-submission prevention | Submit, reload (should say already submitted); clear site data and submit again (the server should refuse with the same message) | **Not tested** with the real database. Verified in the browser only with mocked responses. |
| Results calculations | Compare the results page with a query on the Table Editor (see below) | **Not tested** numerically; you reported the page works with real data. |
| CSV export | Export, open in Excel and Google Sheets; add a choice named `=1+1` and confirm it shows as text | **Not tested** in a spreadsheet. Escaping and paging verified by unit checks and a mocked 2,300-response export. |
| Mobile layout | Student page, dashboard and editor on a real phone | **Not tested** on a real phone. |
| Two browsers | Repeat the main flow in Chrome and another browser (Firefox or Edge) | **Not tested.** |
| Unauthorized access attempts | Section 1 above | **Tested** (students); see its limits. |
| Database Row Level Security | Section 1 above, completed with an active survey and instructor credentials | **Partly tested.** Not complete until the run in "To complete the run" passes. |

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

## 3. Keyboard and accessibility (TODO Phase 13)

| Check | Status |
| --- | --- |
| Every form control and button has an accessible name; one heading level 1 and one main area per page; headings in order | **Tested** on every page (script in the browser, against mocked data) |
| Every focusable element has a visible focus style; a real Tab press showed a 2px outline | **Tested** |
| Text contrast on every page (lowest measured 7.58:1; placeholder text fixed) | **Tested** |
| Focus moves into a confirmation and returns to the opening button on cancel | **Tested** (browser, mocked data) |
| Using the whole app with the keyboard only | **Not tested** (yours to do) |
| A screen reader | **Not tested** |

Keyboard walk-through to do: Tab through the dashboard and open a delete confirmation (focus should land on Cancel; Cancel returns it to Delete); in the editor, save with an empty title (focus lands in the title field); on a student link, submit with an answer missing (focus lands on the first unanswered question); activate and use every button on the present and results pages.

---

## 4. Other checks done while building

- **Logic checks** with throwaway scripts (not kept in the repo): form validation and moving items in the editor, the CSV escaping rules (commas, quotes, line breaks, formula-looking cells), file names, page titles, and the "Copy of" title.
- **Browser checks against mocked database responses** (a fake local login and replaced network calls, so real data was never touched): the editor, activation, present page, student form and its messages, duplicate handling, results and chart layout, CSV export of 2,300 responses with the server limited to 1,000 and then 400 rows per request, and every dashboard state.
- **Bugs found this way and fixed:** the editor staying on "Saving..." after a first save; stale data when moving between surveys' present and results pages; the editor error banner pointing the wrong way and not jumping to the problem.

Not covered by any of the above: real submissions at class scale (the specification asks for 200 simultaneous students) and the deployed site; both belong to the deployment phase.
