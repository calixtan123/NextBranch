# Task 4 report — phone and simulator workflows

Date: 18 September 2026
Worktree: `/Users/calixtan/personal-projects/tfl-tracker/.worktrees/mobile-first-roadmap`
Base: `8b9201a4da1bc9a29a353282f57c87d5f7ad296a`

## Outcome

Updated human documentation only. The README now explains local LAN access,
physical-phone access, iOS Simulator and standard Android Emulator addresses,
the server-only TfL key boundary, local HTTP versus HTTPS Preview, PWA meaning,
and physical-browser installation. `docs/VERIFICATION.md` now contains the
manual mobile release checklist and explicitly separates simulator/emulator
evidence from physical-device evidence.

No native tooling, application behavior, dependencies, or production
configuration were changed.

## Sources consulted

- `.superpowers/sdd/009-mobile-first-roadmap/task-4-brief.md` — exact Task 4
  requirements.
- `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md` from
  installed Next.js **16.3.5** — confirms `next dev` supports `--hostname`,
  documents its network-listening purpose, and confirms the default port is
  3000. The same page documents the separate `--experimental-https` local
  development option; the user-facing workflow intentionally calls for an
  HTTPS Preview for production-like evidence.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  — confirms that only `NEXT_PUBLIC_*` variables are included in the client
  bundle, supporting the server-only `TFL_API_KEY` wording.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
  — confirms that the App Router `manifest` metadata emits a web manifest link.
- `src/app/manifest.ts` and `src/app/layout.tsx` — confirm the generated
  manifest, standalone display metadata, and owned icons already used by this
  project.
- `src/components/InstallHint.tsx` — confirms the existing browser install
  lifecycle, iOS Safari manual guidance, and absence of an unconditional
  install promise.
- `src/lib/tfl/client.ts` — confirms `TFL_API_KEY` is read by the server-side
  TfL client.
- `README.md`, `docs/VERIFICATION.md`, and `plans/009-mobile-first-roadmap.md`
  — existing security, PWA, stale/offline, and release-verification policy.

## Files changed

- `README.md`
  - Added `npm run dev -- --hostname 0.0.0.0` and the physical-phone
    `http://<Mac-LAN-IP>:3000` workflow.
  - Defined LAN, PWA, HTTPS Preview, simulator, and emulator in plain English.
  - Added the exact iOS Simulator (`http://localhost:3000`) and standard
    Android Emulator (`http://10.0.2.2:3000`) addresses.
  - Kept `TFL_API_KEY` explicitly on the Mac/server and prohibited browser or
    `NEXT_PUBLIC_*` copies.
  - Added iOS Safari and Android Chrome home-screen installation steps and the
    physical-device evidence boundary.
- `docs/VERIFICATION.md`
  - Added a manual release checklist for 320px/390px portrait, landscape,
    software keyboard, text zoom, focus, touch targets, horizontal overflow,
    deep-link history, live/stale/offline/error states, home-screen launch, and
    iPhone safe areas.
  - Added explicit HTTPS Preview and physical-device/simulator evidence rules.
- `.superpowers/sdd/009-mobile-first-roadmap/task-4-report.md`
  - This report.

## Verification commands and results

All commands below were run from the task worktree.

| Command | Result |
| --- | --- |
| `node -p "require('next/package.json').version"` | exit 0; `16.3.5` |
| `npm run dev -- --help` | exit 0; Next reports `-H, --hostname <hostname>` and default port `3000` |
| `rg` requirement/source scan across `README.md`, `docs/VERIFICATION.md`, `src/app`, `src/components`, and `src/lib` | exit 0; required addresses, workflow terms, manifest/install references, and server-key references present |
| `if rg -n "TFL_API_KEY\|app_key" public .next/static; then exit 1; else ...; fi` | exit 0; no key/API query name in public or browser static output |
| `git diff --check` | exit 0; no whitespace errors |
| `npm run verify` | exit 0; typecheck, lint, 23 test files, 161 tests passed |
| `npm run build` | exit 0; Next 16.3.5 production build passed; routes include `/`, `/_not-found`, `/api/departures`, `/api/journey`, and `/manifest.webmanifest` |

No prose-grep test was added. The source checks above validate only concrete
implementation/security facts, while the release checklist remains a manual
human verification aid as intended.

## Self-review

- The LAN command is documented exactly as requested and forwards the hostname
  option through the repository's `npm run dev` script.
- Physical phones, iOS Simulator, and standard Android Emulator have separate
  instructions and correct addresses; `10.0.2.2` is explained as the Android
  host-loopback alias rather than a physical-phone address.
- Local HTTP is scoped to layout/interaction checks. HTTPS Preview is required
  in the documentation for production-like installation and geolocation; no
  local HTTP result is promoted to secure-context evidence.
- The documentation defines PWA and does not imply that the current manifest
  provides offline live data. It records that the project has no service
  worker/offline prediction cache.
- The TfL key remains explicitly server-only, and the documentation does not
  ask a phone or simulator to receive it.
- Installation steps cover iOS Safari and Android Chrome, including launch
  from the home-screen icon, while stating that simulator/emulator evidence
  cannot replace physical-device evidence.
- Every requested manual release-check category is represented, including
  deep-link Back/Forward history and iPhone safe areas.
- The diff is documentation/report-only; no native tooling or production
  behavior was added.

## Concerns and checks not run

- No physical phone, iOS Simulator, Android Emulator, browser session, or
  HTTPS Preview was available in this task, so the checklist remains unchecked.
  Those results must be recorded as `NOT RUN` or completed by a release
  operator; the documentation makes no claim that they passed.
- The current app's geolocation work is part of a later roadmap task. This task
  documents the secure-context requirement and release evidence rule without
  claiming that geolocation is currently implemented.
- Network access from a phone can still be blocked by a Mac firewall or
  Wi-Fi client isolation; the README calls this out without suggesting unsafe
  key/server exposure.
