# Classroom Survey

A web app for quick in-class surveys. The instructor builds a survey, activates it, and shows a QR code on the projector. Students scan it, answer on their phones **without logging in**, and the instructor sees the results as they come in.

**Live site:** [https://classroom-survey.shval1128.workers.dev](https://classroom-survey.shval1128.workers.dev)

Built for CSE 4095 (Agentic Programming). See [TODO.md](TODO.md) for the task list and test status, [DECISIONS.md](DECISIONS.md) for design decisions, and [docs/TESTING.md](docs/TESTING.md) for what was tested and how.

> **For graders:** the instructor login is **not stored in this repository**. It is provided with the submission through HuskyCT. Students need no login: open a survey's link or scan its QR code.

## What it does

**Instructor** (log in at `/login`)

- Create and edit draft surveys with multiple-choice and true/false questions.
- Activate a survey (only one can be active at a time), then show the **present page**: a large QR code, the survey link and a live response count, made for a projector.
- Close, archive, duplicate or delete surveys.
- See results as bar charts with counts and percentages, and export them as a CSV file.

**Student** (no account)

- Open the survey link or scan the QR code, choose an answer for every question, submit.
- One submission per browser: coming back shows "You have already submitted a response to this survey."

## Tech stack

| Part     | What is used                                                                                  |
| -------- | --------------------------------------------------------------------------------------------- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router, Recharts (charts), `qrcode` (QR codes)   |
| Backend  | Supabase: Postgres database, Auth (instructor login), row-level security and SQL functions    |
| Hosting  | Cloudflare: a Worker serving the built files as static assets; the database stays on Supabase |
| Tooling  | ESLint, Prettier, GitHub                                                                      |

There is no server code of our own. The browser talks to Supabase directly; what students and the instructor may do is enforced inside the database (see [docs/DATABASE.md](docs/DATABASE.md)).

## Project layout

```text
src/
  components/   Reusable pieces: survey card, question editor, results chart, route guard...
  pages/        One file per screen: Landing, Login, Dashboard, SurveyEditor,
                SurveyPresent, SurveyResults, StudentSurvey, NotFound
  lib/          Supabase client and data access, form validation, CSV export, helpers
  App.tsx, main.tsx, index.css, env.d.ts
supabase/       Database SQL to run in order: 001_schema, 002_rls, 003_functions (+ its own README)
scripts/        check-security.mjs: tries forbidden actions as a student against the real database
docs/           Specification, database design, API, UI, the assignment, and TESTING.md
public/         Static files copied into the build as they are (the favicon)
.env.example    Names of the environment variables (copy to .env)
wrangler.jsonc  Cloudflare deployment settings (static assets, single-page-app routing)
TODO.md         Task list with what is done and tested
DECISIONS.md    Design decisions and why
```

## Running it locally

### 1. Prerequisites

- **Node.js 22.12 or newer** (it was built with Node 24). Check with `node --version`. Vite alone accepts Node 20.19+, but the Supabase client library requires Node 22, and `npm install` warns on older versions.
- **Git** and a free **[Supabase](https://supabase.com) account**.

### 2. Get the code and install

```bash
git clone https://github.com/Londarh/classroom-survey.git
cd classroom-survey
npm install
```

### 3. Set up Supabase

Do this once, in the Supabase dashboard. (Details and checks: [supabase/README.md](supabase/README.md).)

1. **Create a project** (the free plan is enough). Note the database password it asks for; this app never uses it.
2. **Run the three SQL files, in this order**, in the dashboard's **SQL Editor** (paste each file's contents, press Run, wait for "Success"):
   1. [`supabase/001_schema.sql`](supabase/001_schema.sql): tables, indexes and rules (only one active survey).
   2. [`supabase/002_rls.sql`](supabase/002_rls.sql): row-level security, which decides who can read and write what. Do not skip it: without it the tables are open to anyone holding the public key.
   3. [`supabase/003_functions.sql`](supabase/003_functions.sql): the functions the app calls (save, activate, close, archive, submit, results).
3. **Create the instructor user**: **Authentication → Users → Add user → Create new user**, with an email and a password (tick _Auto Confirm User_). This is the account you log in with. Never commit its password.
4. **Turn off public sign-ups**: in the Authentication settings (under _Sign In / Providers_), switch **off** "Allow new users to sign up", and make sure **anonymous sign-ins** are off too. The instructor account can read all results, so nobody else may be able to register. (Menu names change from time to time; look for these two toggles.)

### 4. Configure the environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

(On Windows PowerShell: `Copy-Item .env.example .env`.)

| Variable                                            | Required | Where to get it                                                                                                                                                                                    |
| --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                                 | yes      | Supabase dashboard → **Project Settings → API** (or the **Connect** button): the _Project URL_, like `https://abcdefgh.supabase.co`.                                                               |
| `VITE_SUPABASE_ANON_KEY`                            | yes      | The same page: the public **anon** key (newer projects may call it the _publishable_ key). It is meant to be public. **Never** use the `service_role` / secret key here: it bypasses all security. |
| `VITE_PUBLIC_BASE_URL`                              | no       | Only to test with a phone (see below). Leave it unset otherwise: student links and QR codes then use the address the site is served from.                                                          |
| `TEST_INSTRUCTOR_EMAIL`, `TEST_INSTRUCTOR_PASSWORD` | no       | Only for the security check script (see below): the instructor account from step 3.                                                                                                                |

`.env` is git-ignored and must stay that way. Without the two required values the app shows a "Setup needed" page. Vite reads `.env` when it starts, so restart `npm run dev` after changing it.

### 5. Start it

```bash
npm run dev
```

Open http://localhost:5173, press **Instructor Login**, and sign in with the account from step 3.

**Try the whole flow:** New Survey → add a question and two choices → **Save Draft** → **Activate** (this opens the present page) → open the survey link shown there in another browser or window and submit → on the instructor side open **View Results** and **Export CSV**.

**Testing the QR code with a phone:** a phone cannot reach `localhost`. Find your computer's network address (for example `192.168.1.20`), put `VITE_PUBLIC_BASE_URL=http://192.168.1.20:5173` in `.env`, and start the dev server visible on the network with `npm run dev -- --host`. The phone must be on the same Wi-Fi.

## Scripts

| Command                  | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `npm run dev`            | Start the development server                                                |
| `npm run build`          | Type-check and build to `dist/`                                             |
| `npm run preview`        | Serve the production build locally                                          |
| `npm run lint`           | Run ESLint                                                                  |
| `npm run format`         | Format the code with Prettier                                               |
| `npm run format:check`   | Check formatting without changing code                                      |
| `npm run check:security` | Run the security check against your Supabase project (see the next section) |

## Security check

```bash
npm run check:security
```

The script talks to your **real Supabase project** the way a student's browser does: only the public anon key from `.env`, nobody logged in. It tries things a student must **not** be able to do (read results, insert or change data directly, call the instructor functions) and things a student **should** be able to do (open the active survey, get a clean error for a bad submission), and prints `PASS`, `FAIL` or `SKIP` for each check plus a summary. It exits with an error if any check fails.

- **It cannot change your data.** Every write targets an id that does not exist, and every submission it sends is invalid. It also refuses to run if the key in `.env` is not an anon key, and it never prints keys or passwords.
- **For the full set of checks** (51 at the time of writing), have one **active** survey and add `TEST_INSTRUCTOR_EMAIL` and `TEST_INSTRUCTOR_PASSWORD` to `.env`. Without an active survey, or without those two lines, the checks that need them are skipped (shown as `SKIP`) and the rest still run. Having a closed or archived survey too makes the "hidden surveys stay hidden" check meaningful.
- What a run proved, and what it does not cover: [docs/TESTING.md](docs/TESTING.md).

## Deployment

The live site runs on Cloudflare as a **Worker with static assets**: there is no server code, Cloudflare serves the files that `npm run build` puts in `dist/`. The database stays on Supabase.

### Cloudflare settings

Create the project from the GitHub repository (Cloudflare dashboard → Workers & Pages → connect to Git), then set:

| Setting        | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Build command  | `npm run build`                                                |
| Deploy command | `npx wrangler deploy` (reads [wrangler.jsonc](wrangler.jsonc)) |

Add these as **build** variables (not only runtime ones), because Vite compiles `VITE_` values into the site while it builds, so changing one needs a new build:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: the same values as in your local `.env`. Only the public anon key belongs here; never the service-role key.
- `VITE_PUBLIC_BASE_URL` (optional): leave it unset in production, so student links and QR codes use the site's own address.

Instructor login is email and password only, so Supabase needs no extra redirect or site-URL settings for the deployed address.

### How routing works

The app is a single-page app: pages such as `/login`, `/dashboard` and `/s/x7kf2q` are not files, React Router draws them in the browser. If someone refreshes on one of those addresses, the server must send them the app instead of a "not found" error.

[wrangler.jsonc](wrangler.jsonc) does this with `"not_found_handling": "single-page-application"`: a request for a file that exists in `dist/` (the scripts, styles, favicon) is served as that file, and any other address is answered with `index.html`, after which React Router shows the right page. An address that matches no page shows the app's own "Page not found" screen. (The usual `public/_redirects` rule is not used: Cloudflare rejects it for this kind of deployment with "Infinite loop detected in this rule".)

To check a deployment, open `/login` and refresh it, open `/s/anything` (it should say "Survey not found."), and log in with the instructor account.

## Troubleshooting

| Problem                                                      | Likely cause and fix                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app shows "Setup needed"                                 | `.env` is missing or incomplete. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart `npm run dev`.                                                                                                                                                                               |
| "Incorrect email or password."                               | The instructor user does not exist, was not auto-confirmed, or the password is wrong. Check Authentication → Users in Supabase.                                                                                                                                                                      |
| Errors such as "permission denied" or "function not found"   | One of the SQL files was not run, or not in order. Run `001`, `002`, `003` (they are safe to run again).                                                                                                                                                                                             |
| A student link says "Survey not found."                      | The survey is a draft, or the slug is wrong. Only an activated survey has a working link.                                                                                                                                                                                                            |
| "This survey is no longer accepting responses."              | The survey was closed. Activate a draft (a closed survey cannot be reopened; duplicate it instead).                                                                                                                                                                                                  |
| The site stopped responding after a quiet week               | Free Supabase projects pause after about a week of inactivity. Restore the project in the Supabase dashboard.                                                                                                                                                                                        |
| `npm install` warns about the engine / Node version          | Use Node 22.12 or newer.                                                                                                                                                                                                                                                                             |
| `npm install` reports "10 moderate severity vulnerabilities" | All ten are one advisory in `minimatch`, reached through the ESLint development tools; they never ship in the site. `npm audit --omit=dev` reports 0 vulnerabilities for what the site actually uses. The suggested automatic fix is a breaking downgrade of the lint tooling, so it was left alone. |

## More documentation

- [docs/TESTING.md](docs/TESTING.md): what was tested, how, and the results.
- [docs/](docs): the specification, [database design](docs/DATABASE.md), [API](docs/API.md), [UI](docs/UI.md) and the assignment.
- [supabase/README.md](supabase/README.md): the SQL files, the error codes, and checks to run after setting up the database.
- [DECISIONS.md](DECISIONS.md): design decisions and their reasons.
