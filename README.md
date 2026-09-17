# NextBranch

NextBranch is a small, safety-first Northern line journey checker. It
shows trains that the available route evidence says serve the selected
destination, their origin arrival, platform confidence, and destination ETA.

It is not an official TfL app, a journey planner, a disruption monitor, an
account service, or a replacement for station announcements. It intentionally
has no database, authentication, analytics, push notifications, or service
worker.

## Architecture

```text
Browser → Next frontend → /api/journey or /api/departures route handler → TfL Open Data
```

React owns search, saved journeys, rendering, and request lifecycle. The route
handler validates query parameters, obtains cached topology plus live arrivals,
and applies the tested Northern matcher in `src/lib/northern/`. TfL credentials
are read only on the server.

## Prerequisites and local run

Use Node 20.9 or newer and npm. The repository records the intended version in
`.nvmrc`.

```bash
nvm install
nvm use
npm ci
cp .env.example .env.local
# edit .env.local and set TFL_API_KEY=your TfL Open Data application key
npm run dev
```

Open <http://localhost:3000>. Never put the key in a `NEXT_PUBLIC_*` variable,
browser code, fixtures, or a committed file. `.env.local` is ignored by git.

## Tests and build

Tests use fixed fixtures and dependency injection; normal tests never call live
TfL and do not constitute authenticated integration testing.

```bash
npm run typecheck
npm run lint
npm test
npm run verify
npm run build
npm start
```

The optional discovery tool requires a key for live sampling and never prints
it. It can instead inspect a deliberately supplied fixture path:

```bash
node scripts/tfl-discovery.mjs
node scripts/tfl-discovery.mjs --fixture tests/fixtures/tfl/camden-arrivals.json
```

## Project map

- `src/app/page.tsx`, `src/components/`: App Router page and accessible UI.
- `src/app/api/journey/route.ts`: direct-journey server boundary and degradation policy.
- `src/app/api/departures/route.ts`: cache-free station departure-board boundary.
- `src/lib/northern/`: schemas, topology, route matching, ETA, identity, and ranking.
- `tests/fixtures/tfl/`: deterministic sanitized TfL examples.
- `scripts/`: discovery and asset utilities.
- `docs/`: discovery, learning, and verification records; `plans/`: phased plan.

## Refresh, cache, and PWA policy

Live arrivals and departure boards are requested with `no-store`. Topology and timetables use a
bounded 12-hour Next server cache, with a bundled topology fallback that is
accepted for 30 days. The browser polls only while an active live view is
visible and online, and manual refresh has a 10-second cooldown. A stale result is
retained as clearly marked context after an upstream failure; stale departure countdowns are deliberately de-emphasised rather than presented as fresh data.

The manifest and owned icons support “Add to home screen”. There is no service
worker, offline data cache, background sync, or guaranteed install prompt;
offline mode can only explain that live data is unavailable.

## Attribution and security

The app uses TfL Open Data and is unofficial. Follow TfL data terms and review
the attribution text before public launch. Keep `TFL_API_KEY` server-only,
return `no-store` for journey responses, validate all TfL JSON with Zod, and
avoid logging URLs containing `app_key`.

## Vercel deployment

Vercel is a hosted build and delivery platform that builds a Next.js project,
serves its frontend globally, and runs route handlers as managed server
functions. A typical deployment is:

1. Push the repository to a Git provider and import it into Vercel (the Vercel
   project is external state and is not created by this repository task).
2. Vercel detects Next.js; use `npm ci` for install and `npm run build` for the
   build if asked.
3. In Vercel Project Settings → Environment Variables, add `TFL_API_KEY` for
   Production and, if desired, Preview. Do not add a `NEXT_PUBLIC_` copy.
4. Deploy. Verify the deployed origin and API responses over HTTPS.

Every connected Git push can create a Preview deployment with its own URL;
opening a pull request can update that Preview before production promotion.
Preview and Production environment variables are separate, so configure both
deliberately. A future operator should run the commands in
`docs/VERIFICATION.md` against the deployed build and record the result.
