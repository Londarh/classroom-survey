# AI Development History

A Markdown summary of how I worked with the AI coding agent on this project (assignment section 7 D).

**Tool:** Claude Code (Sonnet 5.5) in the Claude desktop app, working inside this repository.

**How this was written.** This is a summary, not a raw export. It is built from my conversation with Claude Code and from the git history (20 commits, dated 3 to 5 November 2026; the short hashes below are those commits). Text in quotation marks is either copied from a message I sent in that conversation, or is an on-screen message or error text from the app. Everything else is a paraphrase.

**A separate chat.** Besides Claude Code, I used a separate Claude chat to plan the order of the work and to help me word my prompts. That chat is not part of this repository and is not summarised here.

**What I did myself, in every phase.** I created the Supabase and Cloudflare accounts, ran the SQL in the Supabase SQL editor, created the instructor user, turned off sign-ups, set the Cloudflare build variables, and tested by hand. Claude Code could not log in as the instructor, so everything behind the login was checked by it only against fake data and by me against the real thing.

## 1. Setup

**What I asked for.** First, to read every markdown file and explain the app before touching anything: "Please read all of them carefully before you do anything. Don't write any code yet." I also asked for contradictions between the documents, which link format it would choose (I had spotted the `/s/:surveyId` versus `/s/:slug` mismatch) and a build order. After I agreed to its recommendations, I asked it to move the spec files into `docs/`, write them up in `DECISIONS.md`, fix the places where the documents disagreed, and add missing tasks to `TODO.md`. Then I asked for a `.gitignore`, `.env.example` and `.gitattributes` committed on their own first, followed by a Vite, React and TypeScript project with Tailwind, React Router, the Supabase client, Recharts, `qrcode`, ESLint and Prettier, a landing page, a placeholder login page, and no 404 when refreshing on `/login`.

**What it built.** A written understanding of the app, a list of contradictions (the slug versus id link, anonymous inserts versus a submit function, a closed survey looking like "not found"), and a build order. Then `docs/`, `DECISIONS.md` (12 decisions at that point), the edited `TODO.md`, the hygiene files, and the working project (`f0e1dd3`, `793ba45`, `6aee305`). For refresh on routes it added `public/_redirects`, which matters again in section 10.

**What I tested.** Claude Code ran the build, lint and formatting checks, and opened the landing page, the login link and a refresh in the browser. Commits and pushes to GitHub happened only when I asked for them.

**What was fixed or changed.** The current Vite template ships oxlint, so it replaced that with ESLint as I had asked. `typescript-eslint` did not work with TypeScript 7, which the template had installed, so TypeScript was pinned to 6.0.

## 2. Database

**What I asked for.** SQL for the database in the `supabase/` folder, split into numbered files I could run in order in the SQL editor: tables, indexes and triggers first, row level security second, functions third (activate, close, archive, public survey lookup, submit, results, and one to save a draft with all its questions at once). "don't connect to supabase or run anything, I'll paste it in myself." And: "the main thing I care about is security. students should only be able to read the active survey and submit through the function."

**What it built.** `001_schema.sql`, `002_rls.sql` and `003_functions.sql`, a `supabase/README.md` with checks to run afterwards, and database decisions 13 to 20 in `DECISIONS.md` (`d5fafe3`). Beyond the documents, it added an `is_instructor()` check that also rejects anonymous sign-ins, took every table privilege away from the public key except reading three tables, and made each instructor function refuse the public key twice (permissions plus a check inside).

**What I tested.** Claude Code could only parse the SQL locally with a parser; it did not run it. I pasted the three files into the SQL editor, ran them, and ran the checks from `supabase/README.md`. I reported that the SQL was all run and the checks passed.

**What was fixed or changed.** I asked for the testing items in `TODO.md` to stay unchecked until we had tried them. The submit function's error codes were extended beyond the ones in `API.md` and written into `docs/API.md`.

## 3. Login and dashboard

**What I asked for.** Connect the app to Supabase through the environment variables, make the login page work with the instructor account, add logout, send logged-out visitors to `/login`, then build the dashboard from `docs/UI.md`: list of surveys with title, status badge and date, search, status filter, a New Survey button to a placeholder page, my email on the page, and loading, empty and error states. "don't build the edit, activate or delete buttons yet."

**What it built.** `src/lib/supabase.ts`, an auth provider and `useAuth`, a protected route, a login page with friendly error messages, and the dashboard (`e78e55f`).

**What I tested.** Claude Code checked in the browser that opening `/dashboard` while logged out redirects to `/login`, and that a wrong password shows "Incorrect email or password." I logged in for real and reported that login and the dashboard work.

**What was fixed or changed.** I asked it to tick the Supabase setup items in `TODO.md` that I had done by hand (project, SQL files, instructor account).

## 4. Survey editor

**What I asked for.** A real editor replacing the placeholder: title and description, multiple-choice and true/false questions, add and remove choices, move things up and down with simple buttons, and ask before deleting a question. "saving should go through the save_draft_survey function we wrote, not direct inserts into the tables." The same page should edit an existing draft at `/surveys/:id/edit`, refuse non-drafts, and an Edit button on draft cards.

**What it built.** `SurveyEditor.tsx`, `QuestionCard.tsx`, form validation in `src/lib/surveyEditor.ts` and the save call through `save_draft_survey`, with database error codes turned into plain messages (`a012370`).

**What I tested.** Claude Code tested the form logic with small scripts and could not open the editor without a login. I tested it by hand and found a bug: "found a bug in the editor. when I save a brand new survey the button stays on “Saving...” forever and the whole form stays disabled until I refresh."

**What was fixed or changed.** I suggested the cause, that `/surveys/new` and `/surveys/:id/edit` render the same component. Claude Code confirmed it and keyed the form by the survey id so it starts fresh after the redirect (`88befb6`). I also asked it to check for any other place with the same problem. At that point only the editor served two routes, so nothing else needed changing; when the results and present pages were built, Claude Code gave them the same key so moving between two surveys cannot leave old data on screen.

## 5. Activation and the present page

**What I asked for.** An Activate button on draft cards and one in the editor that saves first, using `activate_survey`, then opens a present page for the projector: title, large QR code, readable link built from the site address plus `/s/` and the slug (with an optional environment variable to override the address), a response count that refreshes by itself, Close Survey with a confirmation, Download QR as PNG, and a View Results button. Then the remaining dashboard buttons: Present, Close, Archive and Delete with confirmations, a stronger delete warning with the number of responses, using the database functions for status changes.

**What it built.** `SurveyPresent.tsx`, `SurveyCard.tsx`, `src/lib/publicUrl.ts`, a placeholder results page, and polling every 5 seconds (`b967c80`).

**What I tested.** Claude Code checked that the QR settings produce a valid 1024 pixel PNG. I tested activation, the present page and the QR code later by hand on the live site (see section 10).

**What was fixed or changed.** It added a Results button to dashboard cards, which I had not asked for, because closed surveys otherwise had no way to reach their results.

## 6. Student page

**What I asked for.** A public page at `/s/:slug` using `get_public_survey`, no login and no menu, with the three cases (active, closed, not found) and a loading state; one column, radio buttons, large touch targets, required answers with a message next to the missed question; a random browser token in `localStorage` with a fallback if storage fails, and a remembered "already submitted" state; friendly messages for each error code.

**What it built.** `StudentSurvey.tsx`, `src/lib/browserStorage.ts`, `src/lib/publicSurvey.ts` and `src/lib/studentMessages.ts` (`b32c0fa`). It generates the token with `getRandomValues` because `crypto.randomUUID` does not exist on plain http pages such as a phone testing over a local network.

**What I tested.** Claude Code tested the whole page in the browser with mocked database calls (all messages, the duplicate case, a reload, storage failing). I tested with real submissions and reported that the student page works.

**What was fixed or changed.** Nothing I had to correct here.

## 7. Results and CSV export

**What I asked for.** A results page using `get_survey_results`: title and total, a Recharts bar chart per question with counts and percentages shown as numbers, "No responses yet." when empty, Refresh, Back to Dashboard and Present QR. Then an Export CSV built in the browser: one row per response, question text as headers, quoting for commas and line breaks, a single quote in front of cells starting with `=`, `+`, `-` or `@`, the survey title and date in the file name instead of extra rows (noted in `DECISIONS.md`), and paging through all rows because "supabase only returns 1000 rows per request by default".

**What it built.** `SurveyResults.tsx`, `ResultsChart.tsx`, `src/lib/csv.ts` and `src/lib/results.ts` (`96f7c31`).

**What I tested.** Claude Code exported a mocked 2,300 response survey, with the server limited to 1,000 and then 400 rows per request. I tested the results page with real data and reported that it works.

**What was fixed or changed.** Claude Code's own testing found two problems it fixed before I saw them: stale data when moving between two surveys' pages, and bars that were scaled to the largest count instead of to the percentage. Later I found two things by hand. First, "when a choice has zero answers ... it shows the name but no number at all." Claude Code traced it to Recharts dropping zero-width bars and fixed it (`6a2459f`). Second, I said the 0 should be "at the end of the bar", so every label now sits at the end of its track (`04b4801`).

## 8. Duplicate surveys and the polish pass

**What I asked for.** A Duplicate button on every survey that makes a new draft "Copy of ..." through `save_draft_survey` and opens it in the editor. Then a check of the app against `docs/UI.md` sections 8 to 15 (confirmations, empty states, messages, accessibility): "tell me what you found before changing big things", fix the small gaps, and only tick what was really checked. I said I would test keyboard navigation myself.

**What it built.** Duplicate, plus fixes for the gaps it found: focus now moves into a confirmation and back, the editor's error banner said problems were "below" when they were above and now jumps to the first one, page titles, darker placeholder text, 44 pixel targets (`1e4e81d`).

**What I tested.** Claude Code ran scripted checks of names, focus rules and contrast on every page, against mocked data. I tested duplicating, keyboard navigation and the confirmations by hand.

**What was fixed or changed.** Its first attempt at jumping to a database error did not fire, because React draws messages after a network call a moment later; it moved the jump into an effect. It also dropped smooth scrolling for an instant jump.

## 9. Security testing

**What I asked for.** A script that checks the security of the real database using only the public key, the way a student's browser would, and tries things a student must not be able to do, plus things a student should be able to do. "don't put any keys in the script, read them from .env", and "make sure the script can't change any real data even if a check unexpectedly succeeds, so use ids that don't exist for the writes." If I set instructor credentials in `.env` it should also check as the instructor.

**What it built.** `scripts/check-security.mjs` and `npm run check:security`, then `docs/TESTING.md` (`4bcbca7`). It refuses to run with a service-role key and never prints keys.

**What I tested.** Claude Code ran it first with only the public key: 24 passed, 0 failed, 13 skipped (no active survey, no instructor credentials). I then ran it with an active survey and my instructor login: 51 passed, 0 failed, 0 skipped, and Claude Code recorded that run (`07a9e72`).

**What was fixed or changed.** After the first run Claude Code pointed out that "returned no rows" proves little when there may be no hidden surveys, and made the script say so on that line. I asked that `TODO.md` only tick what was truly tested.

## 10. Deployment

**What I asked for.** I deployed to Cloudflare myself. When the deploy failed I reported the error: "Invalid _redirects configuration: Line 3: Infinite loop detected in this rule". I said Cloudflare deploys the project as a worker with static assets, where the `_redirects` approach is not allowed, and asked it to delete `public/_redirects` and add `wrangler.jsonc` that serves `dist` with single-page-app fallback.

**What it built.** `wrangler.jsonc` with `not_found_handling` set to `single-page-application`, checked with a wrangler dry run, README and `DECISIONS.md` updates (`09c3787`).

**What I tested.** The next deploy worked. On the live site I logged in, activated a survey, scanned the QR code with my phone and submitted an answer, which was recorded (`15d127d`). The two browsers I used were Brave on the computer and my phone's browser. I then tested by hand on the live site: submitting twice, closing a survey, results counts against Supabase, the CSV export, the editor's Activate button and editing a draft (`3c3a0bf`).

**What was fixed or changed.** Before the final README check I asked Claude Code to read the README as a stranger would. It corrected the Node version (the Supabase client needs Node 22, not 20.19), added the Supabase setup steps and the `--host` option for phone testing, searched the repository and all of its history for secrets and found none, and tested a fresh clone (`1e3373c`, `a49ea52`).

## How I steered the agent

A few habits repeated across all phases. I asked it to explain or review before building ("tell me what you found before changing big things"). I kept database work and real-data tests in my own hands. I asked for commits and pushes only when I wanted them, and for TODO items to be ticked only for what had really been tested, which is why `docs/TESTING.md` marks each check as tested, reported by me, or not tested.
