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

## Manual mobile release checklist

This checklist is a release gate, not an automated test. Run it against an
HTTPS Preview for production-like installation and geolocation evidence. Use
the local HTTP workflows in the README for layout and interaction checks, and
record simulator/emulator results separately from physical-device evidence.

### Viewports and device interaction

- [ ] Check a **320px portrait** viewport and a **390px portrait** viewport.
- [ ] Check landscape orientation and confirm the primary content remains
  usable.
- [ ] Open each form with the software keyboard visible; confirm fields,
  suggestions, validation, and submit controls remain reachable.
- [ ] Increase browser text zoom; confirm text, controls, and status messages
  remain readable and usable.
- [ ] Move keyboard focus through navigation, form fields, suggestions,
  actions, saved journeys, and error/retry controls; focus must remain visible.
- [ ] Confirm interactive controls have comfortable touch targets (the
  project target is at least 44 by 44 CSS pixels).
- [ ] Confirm there is no horizontal scrolling at either portrait width or in
  landscape.
- [ ] On an iPhone with a notch or home indicator, confirm content and actions
  do not sit under the safe areas.

### Navigation and data states

- [ ] Open a station deep link (`?station=<id>`), a journey deep link
  (`?from=<id>&to=<id>`), and an invalid/empty link; confirm the visible state
  matches the URL.
- [ ] Navigate between station and journey views, then use browser Back and
  Forward; confirm the URL and view recover together.
- [ ] Check a fresh live response and confirm its update indicator and
  countdowns are understandable.
- [ ] Force or simulate an upstream failure after a successful response;
  confirm retained data is labelled **stale** and is not presented as fresh.
- [ ] Check offline presentation and retry behaviour; confirm the app explains
  that live TfL data requires a connection and does not claim offline live
  support.
- [ ] Check an invalid/error response and confirm an actionable error is shown
  without exposing credentials or raw upstream URLs.

### Installation evidence

- [ ] On a physical iPhone, use iOS Safari's **Share → Add to Home Screen →
  Add**, launch the icon, and check the standalone presentation.
- [ ] On a physical Android phone, use Chrome's **Install app** or **Add to
  Home screen**, launch the icon, and check the standalone presentation.
- [ ] Repeat the relevant browser-menu check in the iOS Simulator and standard
  Android Emulator if useful, but label it supplementary: simulator/emulator
  evidence never replaces physical-device evidence.
- [ ] Record whether the HTTPS Preview, rather than local HTTP, was used for
  installation and geolocation checks.

If a manual item cannot be run, record **NOT RUN** with the reason. Do not turn
simulator success, a local HTTP result, or a manifest response into a claim
that a physical device, geolocation, installation, or offline mode was tested.
