# Verification record

Recorded 16 September 2026 in `/Users/calixtan/personal-projects/tfl-tracker`.

## Environment

- `node --version` → `v25.8.0` (exit 0)
- `npm --version` → `11.11.0` (exit 0)
- `TFL_API_KEY` is set → `no` (value was not printed)

## Automated commands

| Command | Result |
| --- | --- |
| `npm ci` | exit 0; pass — clean install of 459 packages from `package-lock.json` |
| `npm run typecheck` | exit 0; pass |
| `npm run lint` | exit 0; pass |
| `npm test` | exit 0; pass — 18 files, 99 tests |
| `npm run build` | exit 0; pass — `/`, `/_not-found`, `/api/journey`, `/manifest.webmanifest` |
| `npm run verify` | exit 0; pass — typecheck, lint, and the 99-test suite |
| `git diff --check c57f9c4..HEAD` | exit 0; pass — checks the complete committed implementation range |
| `file public/icons/*.png public/fonts/*.woff2` | exit 0; pass — PNGs are 192×192, 512×512, 512×512; both fonts are WOFF2 |
| `node scripts/tfl-discovery.mjs --fixture tests/fixtures/tfl/camden-arrivals.json` | exit 0; pass — explicit fixture path and sanitized JSON |
| `node ~/.codex/skills/impeccable/scripts/detect.mjs --json ...` | exit 0; pass — no reported frontend anti-patterns |

## Production HTTP smoke check

The production build was served locally with `npm run start` and checked over
HTTP. `/` returned 200, `/manifest.webmanifest` returned 200 with
`application/manifest+json`, and `/icons/icon-192.png` returned 200 with
`image/png`. An invalid journey returned 400 `INVALID_JOURNEY`; a valid journey
without `TFL_API_KEY` returned 500 `CONFIGURATION_ERROR`. Both API responses
included `Cache-Control: no-store`.

The manifest test confirms standalone metadata and three owned PNG icons:
`icon-192.png` (192×192), `icon-512.png` (512×512), and
`maskable-512.png` (512×512). No service worker is present or claimed.

## Secret and legacy-name scans

- `rg -n "NEXT_PUBLIC_TFL|app_id" src public tests .env.example` → exit 1;
  pass because there were no matches.
- `rg -n "TFL_API_KEY|app_key" src public .next/static` → exit 0; expected
  server-only source/test references and no public/static matches.
- `rg -n "TFL_API_KEY|app_key" public .next/static` → exit 1; pass because
  public assets and browser static output contain zero matches.

## Checks not run

- Authenticated live TfL smoke check: **NOT RUN** — `TFL_API_KEY` is absent.
- Manual browser interaction: **NOT RUN** — no browser session was available.
- HTTPS/Vercel Preview check: **NOT RUN** — no deployed preview was created.
- Cross-station live longitudinal discovery: **NOT RUN** — the recorded
  discovery is a one-snapshot artifact; fixture discovery was run only to
  verify the tool's sanitization path.

Mocked/dependency-injected tests are deterministic unit/component/API-boundary
tests. They are not live TfL integration tests.

## Manual mobile release matrix

This matrix is the manual release gate. Copy it into the release record (or
duplicate rows when more than one device is checked) and replace each `NOT RUN`
with `PASS` or `FAIL`. A **secure context** is the browser's protected
environment for sensitive web APIs; for this release, use the deployed HTTPS
Preview as the secure-context evidence. Local HTTP is intentionally limited to
layout and interaction checks. Keep physical-device rows separate from
simulator/emulator rows.

In the table, a **deep link** is a URL containing the selected state so that it
opens directly to a station or journey (for example, `?station=<id>` or
`?from=<id>&to=<id>`). **Safe areas** are the inset regions around an iPhone
notch, rounded corners, or home indicator where content should not be placed.
For each row, record the device/OS version, build or Preview URL, date, and
evidence (screenshots, screen recording, or a concise observation) in Notes.

| Target | Browser | Protocol/origin | Viewport/orientation | Applicable checks | Result (`PASS`, `FAIL`, or `NOT RUN`) | Notes/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Physical iPhone | Safari | HTTPS Preview (`https://…`) | 320px portrait | Layout/reflow; no horizontal scrolling; touch targets; visible focus; text zoom; software keyboard; deep-link and Back/Forward history; live, stale, offline, and error states | NOT RUN |  |
| Physical iPhone | Safari | HTTPS Preview (`https://…`) | 390px portrait | Same interaction/data checks; iPhone safe areas around notch/home indicator | NOT RUN |  |
| Physical iPhone | Safari | HTTPS Preview (`https://…`) | Landscape | Layout/reflow; no horizontal scrolling; touch targets; focus; keyboard; text zoom; deep-link/history; live, stale, offline, and error states; iPhone safe areas | NOT RUN |  |
| Physical iPhone | Safari | HTTPS Preview (`https://…`) | Device viewport / home screen | Safari **Share → Add to Home Screen → Add**; launch the icon; confirm standalone presentation; geolocation, if the feature is enabled | NOT RUN | HTTPS evidence only; do not substitute local HTTP or simulator results |
| Physical Android phone | Chrome | HTTPS Preview (`https://…`) | 320px portrait | Layout/reflow; no horizontal scrolling; touch targets; visible focus; text zoom; software keyboard; deep-link and Back/Forward history; live, stale, offline, and error states | NOT RUN |  |
| Physical Android phone | Chrome | HTTPS Preview (`https://…`) | 390px portrait | Same interaction/data checks | NOT RUN |  |
| Physical Android phone | Chrome | HTTPS Preview (`https://…`) | Landscape | Layout/reflow; no horizontal scrolling; touch targets; focus; keyboard; text zoom; deep-link/history; live, stale, offline, and error states | NOT RUN |  |
| Physical Android phone | Chrome | HTTPS Preview (`https://…`) | Device viewport / home screen | Chrome **Install app** or **Add to Home screen**; launch the icon; confirm standalone presentation; geolocation, if the feature is enabled | NOT RUN | HTTPS evidence only; do not substitute local HTTP or emulator results |
| iOS Simulator | Safari | Local HTTP (`http://localhost:3000`) | 320px portrait | Supplementary layout/reflow; no horizontal scrolling; touch targets; visible focus; text zoom; software keyboard; deep-link and Back/Forward history; live, stale, offline, and error states | NOT RUN | Local layout/interaction evidence only; not physical-device or HTTPS installation/geolocation evidence |
| iOS Simulator | Safari | Local HTTP (`http://localhost:3000`) | 390px portrait | Same supplementary interaction/data checks | NOT RUN |  |
| iOS Simulator | Safari | Local HTTP (`http://localhost:3000`) | Landscape | Supplementary layout/reflow; no horizontal scrolling; touch targets; focus; keyboard; text zoom; deep-link/history; live, stale, offline, and error states | NOT RUN | Simulator result; do not report as physical iPhone evidence |
| iOS Simulator | Safari | Local HTTP (`http://localhost:3000`) | Simulator viewport / browser menu | Optional manifest/menu observation only; installation and geolocation are not release evidence here | NOT RUN | Use the physical iPhone HTTPS row for installation/geolocation evidence |
| Standard Android Emulator | Chrome | Local HTTP (`http://10.0.2.2:3000`) | 320px portrait | Supplementary layout/reflow; no horizontal scrolling; touch targets; visible focus; text zoom; software keyboard; deep-link and Back/Forward history; live, stale, offline, and error states | NOT RUN | Local layout/interaction evidence only; not physical-device or HTTPS installation/geolocation evidence |
| Standard Android Emulator | Chrome | Local HTTP (`http://10.0.2.2:3000`) | 390px portrait | Same supplementary interaction/data checks | NOT RUN |  |
| Standard Android Emulator | Chrome | Local HTTP (`http://10.0.2.2:3000`) | Landscape | Supplementary layout/reflow; no horizontal scrolling; touch targets; focus; keyboard; text zoom; deep-link/history; live, stale, offline, and error states | NOT RUN | Emulator result; do not report as physical Android evidence |
| Standard Android Emulator | Chrome | Local HTTP (`http://10.0.2.2:3000`) | Emulator viewport / browser menu | Optional manifest/menu observation only; installation and geolocation are not release evidence here | NOT RUN | Use the physical Android HTTPS row for installation/geolocation evidence |

### Operator terms and pass criteria

The **manifest** is the JSON metadata that tells a browser the app's name,
icons, start URL, and display preference. A **standalone presentation** is the
home-screen launch view with the browser's ordinary address/tab controls hidden;
it does not imply offline data. Treat a row as `PASS` only when every check in
its Applicable checks cell is observed. Use `FAIL` for a regression or
unexpected browser/device result, and `NOT RUN` when the environment or
evidence was unavailable.

For every target, the operator should check the following behavior through the
rows above: the software keyboard must not hide fields, suggestions,
validation, or submit controls; text zoom must keep text and status messages
usable; keyboard focus must remain visible; controls should meet the project's
44-by-44 CSS-pixel touch-target goal; and neither portrait width nor landscape
may introduce horizontal scrolling. Deep links must match the visible state
and recover with browser Back/Forward. Fresh data, clearly labelled stale data,
offline guidance, and actionable errors must remain distinguishable, with no
credentials or raw upstream URLs exposed.

If a manual row cannot be run, leave it as **NOT RUN** and record the reason.
Never turn a simulator/emulator result, local HTTP result, or manifest response
into a claim that a physical device, HTTPS installation, geolocation, or
offline live-data mode was tested.
