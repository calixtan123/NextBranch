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

## Phone and simulator workflows

The normal `localhost` address is reachable only from the Mac running Next.js.
For a physical phone, start the development server on the Mac's network
interfaces:

```bash
npm run dev -- --hostname 0.0.0.0
```

`--hostname` is a Next.js command-line option. `0.0.0.0` tells the development
server to listen for connections on the Mac's network interfaces. LAN means
“local area network”: in this workflow it is the trusted Wi-Fi network shared
by the Mac and the phone. Find the Mac's Wi-Fi/LAN IP address in the macOS
network settings, then use that address on the phone:

```text
http://<Mac-LAN-IP>:3000
```

The physical phone must be on the same trusted Wi-Fi. The TfL request still
passes through the Mac's Next.js server, so keep `TFL_API_KEY` in the Mac's
`.env.local` only. Do not copy the key to the phone, put it in a URL, or create
a `NEXT_PUBLIC_TFL_API_KEY` variable. If the phone cannot connect, check the
Mac firewall and whether the Wi-Fi network blocks device-to-device traffic;
never solve this by exposing the key or development server to an untrusted
network.

An iOS Simulator is a virtual iPhone running on the Mac; an Android Emulator
is a virtual Android device. They are useful for repeatable browser checks but
are not physical-device evidence (for example, they do not reproduce every
radio, safe-area, keyboard, or OS integration detail). Use these addresses:

| Target | Browser | Address |
| --- | --- | --- |
| Physical phone on the same Wi-Fi | Safari or Chrome | `http://<Mac-LAN-IP>:3000` |
| iOS Simulator | Safari | `http://localhost:3000` |
| Standard Android Emulator | Chrome | `http://10.0.2.2:3000` |

`10.0.2.2` is the standard Android Emulator alias for the host computer's
`localhost`; it is not the address to use on a physical Android phone.

Local HTTP is enough to check responsive layout, interaction, keyboard/focus
behaviour, and the application's ordinary live/stale/error handling. An
HTTPS Preview is a deployed preview URL served over encrypted HTTPS. Use an
HTTPS Preview for production-like PWA installation and geolocation checks:
modern browsers restrict sensitive APIs such as geolocation to a secure
context, and install behaviour differs between HTTP development pages and a
deployed origin. A local HTTP check must not be recorded as geolocation or
production-like installation evidence.

PWA means “Progressive Web App”: a website that can advertise install metadata
to the browser and, when the browser supports it, open from a home-screen icon
like an app. This project has a web manifest, standalone metadata, and owned
icons, but deliberately has no service worker or offline live-data cache. An
installed icon therefore does not make live TfL data available offline.

### Install from a physical browser

Use the HTTPS Preview on a physical device when collecting release evidence.
The browser may offer slightly different wording, and the app does not promise
a guaranteed install prompt.

- **iOS Safari:** open the HTTPS Preview, tap **Share**, choose **Add to Home
  Screen**, review the name, and tap **Add**. Launch the new home-screen icon
  and check that the app opens in its standalone presentation.
- **Android Chrome:** open the HTTPS Preview, tap the three-dot menu, choose
  **Install app** or **Add to Home screen** (the available label depends on
  Chrome), confirm, and launch the new icon.

Simulator/emulator installation can be a useful supplementary check of browser
menus and manifest metadata, but it does not replace a physical iPhone or
Android phone check. Record physical-device installation, safe-area, and
network results separately in the release checklist in
[`docs/VERIFICATION.md`](docs/VERIFICATION.md).

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
