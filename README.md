# Classroom Survey

A web app for quick in-class surveys. Instructors create surveys and show a QR code in class; students scan it, answer on their phones without logging in, and the instructor sees the results.

> Work in progress for CSE 4095. See [TODO.md](TODO.md) for current status and [DECISIONS.md](DECISIONS.md) for design decisions.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, React Router, Supabase (Postgres + Auth), Recharts, `qrcode`. Hosted on Cloudflare Pages.

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

Copy `.env.example` to `.env` and fill in your Supabase project values. The `.env` file is git-ignored; never commit it. Supabase is not used yet, so the app runs without it for now.

### Other scripts

| Command                | What it does                           |
| ---------------------- | -------------------------------------- |
| `npm run build`        | Type-check and build to `dist/`        |
| `npm run preview`      | Serve the production build locally     |
| `npm run lint`         | Run ESLint                             |
| `npm run format`       | Format the code with Prettier          |
| `npm run format:check` | Check formatting without changing code |

## Project layout

```text
docs/        Specification, database, API, UI, and assignment documents
src/         Application code (components/, pages/, lib/)
public/      Static files, including _redirects for single-page-app routing
supabase/    Database SQL (schema, policies, functions) - added later
```

## Deployment

Planned: Cloudflare Pages connected to the GitHub repository (build command `npm run build`, output directory `dist`). `public/_redirects` makes routes such as `/login` work on page refresh. Full setup and deployment instructions will be added here.
