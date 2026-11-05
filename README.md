# Classroom Survey

A web app for quick in-class surveys. Instructors create surveys and show a QR code in class; students scan it, answer on their phones without logging in, and the instructor sees the results.

**Live site:** [https://classroom-survey.shval1128.workers.dev](https://classroom-survey.shval1128.workers.dev)

> Work in progress for CSE 4095. See [TODO.md](TODO.md) for current status and [DECISIONS.md](DECISIONS.md) for design decisions.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, React Router, Supabase (Postgres + Auth), Recharts, `qrcode`. Hosted on Cloudflare (a Worker that serves the built files as static assets).

## Running locally

Requires Node.js 20.19 or newer (or 22.12+).

```bash
npm install
```

```bash
npm run dev
```

The app is then available at http://localhost:5173.

### Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project values (Project Settings > API: the project URL and the public `anon` key). The `.env` file is git-ignored; never commit it. Without these values the app shows a "Setup needed" page.

Optional: `VITE_PUBLIC_BASE_URL` sets the address used in student links and QR codes (default: the address the site is served from). To test with a phone during development, set it to your computer's network address, for example `http://192.168.1.20:5173`, and restart the dev server.

The database must be set up first: see [supabase/README.md](supabase/README.md) for the SQL files and for creating the instructor account you log in with.

### Other scripts

| Command                  | What it does                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm run build`          | Type-check and build to `dist/`                                                                       |
| `npm run preview`        | Serve the production build locally                                                                    |
| `npm run lint`           | Run ESLint                                                                                            |
| `npm run format`         | Format the code with Prettier                                                                         |
| `npm run format:check`   | Check formatting without changing code                                                                |
| `npm run check:security` | Try forbidden actions as a student against the real database (see [docs/TESTING.md](docs/TESTING.md)) |

## Project layout

```text
docs/        Specification, database, API, UI, and assignment documents
src/         Application code (components/, pages/, lib/)
public/      Static files copied into the build as they are (the favicon)
scripts/     check-security.mjs: tries forbidden actions as a student (see docs/TESTING.md)
supabase/    Database SQL: schema, policies and functions (see supabase/README.md)
wrangler.jsonc  Cloudflare deployment settings (static assets, single-page-app routing)
```

## Deployment

The site is deployed on Cloudflare as a **Worker with static assets**: there is no server code, Cloudflare just serves the files that `npm run build` puts in `dist/`. The database stays on Supabase.

### Cloudflare settings

Create the project from the GitHub repository (Workers & Pages), then set:

| Setting        | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Build command  | `npm run build`                                                |
| Deploy command | `npx wrangler deploy` (reads [wrangler.jsonc](wrangler.jsonc)) |

Add these as **build** variables (not only runtime ones), because Vite compiles `VITE_` values into the site while it builds, so changing one needs a new build:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: the same values as in your local `.env`. Only the public anon key belongs here; never the service-role key.
- `VITE_PUBLIC_BASE_URL` (optional): leave it unset in production, so student links and QR codes use the site's own address.

### How routing works

The app is a single-page app: pages such as `/login`, `/dashboard` and `/s/x7kf2q` are not files, React Router draws them in the browser. If someone refreshes on one of those addresses, the server must send them the app instead of a "not found" error.

[wrangler.jsonc](wrangler.jsonc) does this with `"not_found_handling": "single-page-application"`: a request for a file that exists in `dist/` (the scripts, styles, favicon) is served as that file, and any other address is answered with `index.html`, after which React Router shows the right page. An address that matches no page shows the app's own "Page not found" screen. (The usual `public/_redirects` rule is not used: Cloudflare rejects it for this kind of deployment with "Infinite loop detected in this rule".)

To check a deployment, open `/login` and refresh it, open `/s/anything` (it should say "Survey not found."), and log in with the instructor account.
