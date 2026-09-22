# 009 — Mobile-first product roadmap

Status: In progress. Base branch: `chore/ignore-local-agent-tooling`.

## Context

Northern Direct is a safety-first, Northern-line-specific Next.js PWA for passengers using a phone at or near a station. This plan makes the existing PWA trustworthy on phones, adds fast commuter conveniences, and adds production safeguards without creating a native application or widening the routing domain.

## Global Constraints

- Preserve the safety invariant: never invent a route, platform, ETA, live status, accessibility status, or confidence level when evidence is absent or malformed.
- Keep `TFL_API_KEY` server-only. Never put it in browser code, fixtures, logs, shared URLs, or a `NEXT_PUBLIC_*` variable.
- Use test-driven development for behavior changes: add a focused failing test, record the expected failure, implement the minimum behavior, then run the focused and full verification commands.
- Use specific error handling; preserve previously safe stale data only when it is clearly labelled stale.
- Keep live predictions cache-free. Do not add a service worker or offline prediction cache.
- Keep saved journeys and stations device-local. Raw geolocation must never leave the browser, be logged, or be persisted.
- Preserve canonical deep links: `?station=<id>` for departure boards and `?from=<id>&to=<id>` for direct journeys.
- Preserve WCAG 2.2 AA intent, 44-by-44-pixel controls, keyboard operation, visible focus, screen-reader announcements, reduced motion, and light/dark themes.
- Keep the app Northern-line-specific. Do not add accounts, push notifications, disruption monitoring, native wrappers, additional Tube lines, or unrelated refactors.
- Add NumPy-style documentation to new public functions where Parameters, Returns, or Raises apply; module, class, and public-function docstrings remain required by repository instructions.
- Verification gates are `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`; after browser coverage exists, also run `npm run test:e2e`.
- Do not merge, push, deploy, publish, create paid/external resources, or modify production configuration as part of repository implementation.

## Task 1 — Correctness and accessible journey decisions

Implement three focused fixes with tests first.

1. In `TrainCard`, ensure the Destination value exposes both the formatted arrival time and its evidence (`Live`, `Estimated`, or `Unavailable`) to assistive technology. An `aria-label` must not hide the visible arrival time.
2. In the journey form, disable Swap unless both stations are selected. Test empty, origin-only, and complete valid selections.
3. At the TfL arrivals boundary, preserve these exact cases:
   - `[]` is a valid empty snapshot.
   - A mixed array keeps valid arrival records and drops malformed records.
   - A non-empty array with zero valid records throws a typed/normalized upstream payload error, so both journey and departure routes return the existing `503` response `{ "error": "TFL_UNAVAILABLE" }`.

Add or update focused tests in the existing component, schema, TfL client, and route test files. Run focused tests, `npm run verify`, and `npm run build` before committing.

## Task 2 — Request deadlines and visibility-aware clocks

Add explicit request deadlines without changing public success payloads.

- Put the server timeout in the central TfL client as a named constant. Compose it with any supplied abort signal using native platform APIs where practical, and normalize timeout/abort failures to the existing upstream error category.
- Put the browser timeout in `useLiveRequest` as a named constant. A timeout must end loading, produce the existing upstream issue, retain keyed stale data, clear the in-flight slot, and permit a later retry.
- Clear all timeout resources on success, failure, abort, key change, and unmount.
- Run the one-second `now` clock only when the visible departures/results view has data. Pause it when `document.visibilityState` is not `visible`, and set `now` from `Date.now()` immediately when visibility returns.
- Preserve request coalescing, navigation cancellation, polling, manual cooldown, and expired-train refresh behavior.

Use fake timers and behavior-focused hook/component tests. Run focused tests, `npm run verify`, and `npm run build`.

## Task 3 — Complete PWA installation lifecycle

Replace the loose install-event handling with explicit UI state owned by a focused hook or small component rather than adding more unrelated responsibilities to `Home`.

- Support prompt available, prompting, manual iOS instructions, installed, dismissed, and unsupported states.
- Await the captured Chromium prompt, clear it after use, handle rejection without an unhandled promise, and hide guidance after `appinstalled` or standalone display mode.
- When install eligibility is reached on iOS Safari and no Chromium prompt exists, present concise instructions: Safari Share, then Add to Home Screen.
- Do not claim offline live-data support.
- Keep session-scoped dismissal behavior.

Test event capture, acceptance/dismissal/rejection, one-use prompt behavior, `appinstalled`, standalone display, iOS instructions, unsupported browsers, and session dismissal. Run verification and build.

## Task 4 — Document phone and simulator workflows

Update human documentation only; do not add native application tooling.

- Document `npm run dev -- --hostname 0.0.0.0` for LAN access.
- Physical phone: same trusted Wi-Fi, open `http://<Mac-LAN-IP>:3000`, and keep the TfL key on the Mac/server.
- iOS Simulator: Safari at `http://localhost:3000`.
- Standard Android Emulator: Chrome at `http://10.0.2.2:3000`.
- Explain that local HTTP covers layout/interaction, while an HTTPS Preview is required for production-like installation and geolocation.
- Add a release checklist for 320px/390px portrait, landscape, software keyboard, text zoom, focus, touch targets, no horizontal scrolling, deep-link history, live/stale/offline/error states, home-screen launch, and iPhone safe areas.
- Describe iOS Safari and Android Chrome installation steps without claiming simulator evidence replaces physical-device evidence.

Verify commands and Next.js behavior against the installed Next 16 documentation. Run Markdown/source checks only where they verify behavior; prose itself does not need automated tests.

## Task 5 — Deterministic real-browser mobile coverage

Add Playwright with the smallest useful configuration.

- Add `test:e2e` and the required development dependencies.
- Configure mobile Chromium and mobile WebKit projects at representative phone sizes.
- Start the production-like Next server through Playwright web-server configuration.
- Intercept `/api/journey` and `/api/departures` with complete deterministic response fixtures; never call live TfL or require credentials.
- Cover station selection/departures, direct journey submission/results, saved journey reopening, browser back/forward deep links, stale/error/offline presentation where browser support permits, keyboard focus, manifest availability, and absence of horizontal overflow at 320px and 390px.
- Add an automated accessibility scan for departures, search, results, and saved journeys.
- Add a GitHub Actions workflow using Node 24 that runs `npm ci`, `npm run verify`, `npm run build`, and `npm run test:e2e`.
- Do not automate operating-system home-screen installation.

Run all verification gates including `npm run test:e2e`.

## Task 6 — Saved and recent departure stations

Extend the existing defensive storage pattern with a separate station collection.

```ts
export type SavedStation = {
  id: string;
  name: string;
  lastUsedAt: number;
};
```

- Use a separately named, versioned local-storage key and a maximum of five stations.
- Validate every ID against the canonical station map, canonicalize names from that map, drop malformed/obsolete entries, deduplicate by ID, and order by most recent use.
- Storage read/write denial must not block the app.
- Explicit URL precedence is: valid `station`; valid `from` plus `to`; saved/recent state; empty station chooser.
- Show saved/recent stations above the departures combobox as compact one-tap controls. Support save/unsave, remove, and five-second undo using existing interaction conventions.
- Fetch only the active station; saved rows must not cause background requests.
- Never persist live predictions.

Test storage happy/error/boundary cases, URL precedence, remounts, removal/undo, keyboard/accessibility behavior, and absence of inactive fetches. Run all verification gates.

## Task 7 — Native sharing with clipboard fallback

Add a quiet Share action for an active station and active journey.

- Construct the absolute URL from `window.location.origin` and canonical selection parameters only.
- Prefer `navigator.share()` when available; treat user cancellation as neutral.
- Otherwise use the Clipboard API and announce `Link copied` through an accessible status region.
- If both mechanisms fail, show a concise accessible error without discarding current results.
- Never include live payloads, credentials, raw location, or environment data.

Test native share success, cancellation, rejection, clipboard success/failure, canonical URL construction, and opening the generated URLs in clean state. Run all verification gates.

## Task 8 — Opt-in nearest Northern station

Generate a small reviewed coordinate artifact from the existing station-point dataset and keep runtime logic browser-local.

- Create a script that maps canonical Northern station IDs to one representative latitude/longitude and rejects missing, duplicate, non-finite, or out-of-range coordinates.
- Commit the generated Northern-only artifact, not the source dataset.
- Add a pure, documented Haversine-distance function returning metres and deterministic nearest-station selection with canonical ID tie-breaking.
- Add `Use nearest station` beside manual selection. Call browser geolocation only after that explicit action.
- Never transmit, log, or persist raw coordinates.
- For poor accuracy or a close nearest/second-nearest result, show the proposed station and approximate distance and require confirmation. Otherwise select/open the normal `?station=` view.
- Handle denied, unavailable, timeout, unsupported, and inaccurate outcomes while preserving manual search.

Test generator validation, known distance, deterministic ties, every browser failure state, confirmation behavior, normal selection, and privacy boundaries. Run all verification gates.

## Task 9 — Production safeguards and redacted diagnostics

Implement repository-owned safeguards without provisioning an external service.

- Add structured server diagnostics for operation, duration, normalized error category, numeric upstream status when available, and topology fallback use.
- Never log the full upstream URL, headers, credentials, raw location, or complete payloads. Provide a focused redaction/normalization helper and test it.
- Add short-lived in-process promise coalescing for identical simultaneous live station-arrival requests. This is duplicate-work protection, not cross-instance rate limiting; never cache settled live prediction results beyond the request overlap.
- Define the public rate-limit error contract as HTTP `429` with `{ "error": "RATE_LIMITED", "retryAfterSeconds": 30 }`, add parsing/client presentation, and test it.
- Define a small server-side rate-limit adapter boundary that defaults to allowing requests. Document that production must supply a distributed hosting-level implementation. Do not add an in-memory limiter that falsely claims cross-instance protection and do not provision external resources.

Test concurrent coalescing, promise cleanup after success/failure, diagnostic redaction, `429` response headers/body, and client retry guidance. Run all verification gates.

## Task 10 — Reproducible Node and topology maintenance

- Standardize `.nvmrc`, `package.json` engines, GitHub Actions, README, and verification guidance on Node 24.x.
- Replace split/regex-dependent topology generation with one reviewed command that accepts structured parsed data, schema-validates it, writes the bundled topology and direct-destination artifacts together, and stamps the capture time.
- Add a non-mutating topology age check. CI warns when the snapshot is approaching 30 days and fails release verification when already expired.
- Preserve human review of generated route changes; the command must print a concise summary and never auto-publish.
- Add consistency tests proving browser direct destinations and server topology derive from the same snapshot.

Run generator tests against fixtures, all verification gates, and confirm a normal build does not silently rewrite tracked files.

## Task 11 — Northern station-accessibility data spike

This is a bounded data-quality spike. Do not build step-free routing.

- Inspect source provenance/date fields, Northern identifier joins, null patterns, and contradictory records in the existing ignored station CSV dataset.
- Add a repeatable analysis script that emits a sanitized Northern-only report/artifact from an explicitly supplied dataset directory; fail clearly when files or required columns are absent.
- Document which static facts are trustworthy enough for display, their source date/update limitation, and which claims remain prohibited.
- Only if identifier joins and provenance are reliable, add a small read-only station facts module/card for directly supported published facts. Label them as published station information, use `Unknown` for absent data, and never claim live lift status or an entirely step-free journey.
- If the data cannot safely support a card, commit the analysis script and report only; record that outcome rather than inventing a UI.

Test parsing/join/null/error behavior with small sanitized fixtures. Run all verification gates.

## Final Review and Completion

After every task has passed its task-scoped review, run the full verification suite and generate a whole-branch review package from the branch fork point. Dispatch the final reviewer on the most capable available model. Resolve findings through one consolidated fix wave and one scoped re-review. Report all ledger rulings and manual/external checks still required, then use the finishing-a-development-branch workflow. Do not merge or push without the user's explicit choice.
