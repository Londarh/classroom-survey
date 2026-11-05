# Development Summary

Classroom Survey for CSE 4095. Live site: https://classroom-survey.shval1128.workers.dev

## How I used the spec documents

The assignment came with five markdown files. Before writing any code I moved them into a docs folder and told Claude Code to read all of them and not build anything yet. I used Claude Code instead of Cursor. I also had a separate Claude chat open for planning the order of the work and for helping me word my prompts, so some of what I typed to Claude Code was first drafted there.

Reading first paid off. Claude Code came back with a list of places where the files disagree. I had only noticed one, the student link, which is /s/:surveyId in TODO.md and /s/:slug everywhere else. We went with the slug because DATABASE.md already had a public_slug column and a short slug makes a smaller QR code. It also caught that DATABASE.md says students need INSERT on the responses table and a few lines later says to use a function instead, and that a closed survey would look like "not found" to students because the security policy hides it. I agreed to its fixes and they went into DECISIONS.md, which has 31 entries now. After that most of my prompts just said to follow docs/ and DECISIONS.md.

## What the AI generated

Claude Code wrote the code: about 3,800 lines of TypeScript and React in src, the three SQL files in supabase, scripts/check-security.mjs, and the docs. I did the parts that needed my accounts and my hands. I made the Supabase and Cloudflare accounts, pasted and ran the three SQL files in the SQL editor, created the instructor user, turned off sign-ups, and typed the build variables into Cloudflare. I also did the testing that needed a real login.

## How the database is set up

There are five tables, surveys, questions, choices, responses and answers, created by three files that run in order. 001_schema.sql makes the tables and a partial unique index called only_one_active_survey, so the database itself refuses a second active survey. 002_rls.sql turns on row level security and takes away everything the public key could do except read the active survey. Students have no permission at all on responses or answers. 003_functions.sql holds the functions. Students submit through submit_survey_response, which checks that the survey is active, that each choice belongs to its question, and that the browser token hasn't been used, and it raises short codes like DUPLICATE_RESPONSE. After each file I ran the test queries from supabase/README.md, like the one that lists which role can run which function, and they matched what the docs said.

## How the frontend talks to the database

There's no server of our own. src/lib/supabase.ts builds one supabase-js client from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and the pages call the database straight from the browser. The instructor pages never insert rows by hand. Saving a survey calls supabase.rpc('save_draft_survey') with the whole survey, so it either saves completely or not at all. The student page calls get_public_survey with the slug from the link, then submit_survey_response with the answers and a random token that src/lib/browserStorage.ts keeps in localStorage. That token is how the "already submitted" message works.

## Problems I ran into

The first bug I found myself. After saving a brand new survey the button stayed on "Saving..." and the form stayed disabled, even though the survey was in the database after a refresh. My guess was that /surveys/new and /surveys/:id/edit both render the same editor component, so React kept the old one and its saving state. I told Claude Code my guess, it agreed, and the fix was giving the form a key based on the survey id so React starts a fresh copy (commit 88befb6).

The second was on the results page. A choice nobody picked, like "5" when everyone picked "4", showed its name and no number. It should say "0 (0%)". Claude Code read the Recharts source and found that the library throws away any bar with zero width unless it has a custom shape, and the labels are drawn from that same data. The fix was one line, shape={<Rectangle />}. Then I said the 0 should sit at the end of the bar, like "2 (100%)" does, so now every label lines up at the end of its track.

## How I deployed it

I connected my GitHub repo to Cloudflare, set the build command to npm run build and the deploy command to npx wrangler deploy, and added the two Supabase variables as build variables. They have to be build variables because Vite bakes VITE_ values into the JavaScript while it builds. The first deploy failed with "Invalid _redirects configuration: Line 3: Infinite loop detected in this rule". We had a public/_redirects file so refreshing on /login wouldn't give a 404, but Cloudflare was deploying the project as a Worker with static assets, and there that rule isn't allowed. Claude Code deleted the file and added wrangler.jsonc with not_found_handling set to single-page-application, and the next deploy worked. I logged in on the live site, activated a survey, scanned the QR code with my phone and submitted an answer, and it was recorded. I tried it in Brave and in my phone's browser.

## What I learned

The thing that stuck with me is where security actually lives. A student can send any request the public key allows, whatever buttons the page shows, so the database has to be the one that says no. The security script runs 51 checks against the real project, and every attempt to read responses or call an instructor function as a student came back "permission denied". I also learned the anon key is public on purpose, since VITE_ values end up in the site's JavaScript, and that the service role key must never go anywhere near it. And code that compiles and passes lint can still be wrong. The stuck Saving... button and the missing 0 both got past the AI, and I only caught them by clicking around.
