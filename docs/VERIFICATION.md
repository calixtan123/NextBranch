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
| `git diff --check c57f9c4..HEAD` | pending until the verified files are committed |
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
