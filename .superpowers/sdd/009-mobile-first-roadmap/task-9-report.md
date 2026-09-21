# Task 9 Report — Production safeguards and redacted diagnostics

## Implementation summary

- Added fixed-shape server diagnostics with the operation name, integer duration,
  normalized error category, optional numeric upstream status, and topology-fallback
  flag. The normalization helper deliberately discards error messages and arbitrary
  properties, so it cannot log upstream URLs, headers, credentials, locations, or
  payloads.
- Added a short-lived in-process promise registry for identical, simultaneous live
  station-arrival calls. It shares only the pending promise and removes it after
  success or failure; a later refresh always makes a fresh `cache: "no-store"`
  request. Caller-cancelled calls are intentionally not shared.
- Added the public 429 contract on both API boundaries: `Retry-After: 30` and
  `{ "error": "RATE_LIMITED", "retryAfterSeconds": 30 }`. Each handler has one
  dependency-injected limiter check, whose default is explicitly allow-all. The
  shared adapter documents that production must supply distributed hosting-level
  limiting rather than an in-memory approximation.
- Added browser parsing and accessible alert text for rate limits. The browser keeps
  the server retry window separate from the existing manual-refresh cooldown, so it
  does not regress request coalescing or stale-data behavior.

## Files changed

- `src/lib/tfl/client.ts`, `src/lib/tfl/client.test.ts`
- `src/lib/tfl/diagnostics.ts`, `src/lib/tfl/diagnostics.test.ts`
- `src/lib/rate-limit.ts`
- `src/app/api/departures/route.ts`, `src/app/api/departures/route.test.ts`
- `src/app/api/journey/route.ts`, `src/app/api/journey/route.test.ts`
- `src/components/useLiveRequest.ts`, `src/components/useLiveRequest.test.ts`
- `src/components/Home.tsx`

The pre-existing `.gitignore` change was preserved and excluded from this task.

## RED — failing tests before production changes

Command:

```sh
npm test -- src/lib/tfl/client.test.ts src/app/api/departures/route.test.ts src/app/api/journey/route.test.ts src/components/useLiveRequest.test.ts
```

Relevant expected failures:

```text
coalesces only overlapping arrivals requests ... expected spy to be called 1 times, but got 2
removes a failed arrivals request ... expected spy to be called 1 times, but got 2
journey/departures rate-limit contract ... Cannot read properties of undefined (reading 'filter')
presents server rate-limit retry guidance ... expected 'invalid' to be 'rate_limited'
```

Why this failed: before this task there was no overlap registry, no injected
rate-limit boundary, and no browser recognition of the documented 429 payload.

The redaction-helper test was then added before its module existed and run with:

```sh
npm test -- src/lib/tfl/diagnostics.test.ts
```

Expected failure:

```text
Failed to resolve import "./diagnostics" ... Does the file exist?
```

This demonstrated the missing diagnostic-normalization behavior before the helper
was implemented.

## GREEN — focused verification

Commands and passing results:

```sh
npm test -- src/lib/tfl/client.test.ts
# 1 passed file, 24 passed tests

npm test -- src/lib/tfl/client.test.ts src/lib/tfl/diagnostics.test.ts src/app/api/departures/route.test.ts src/app/api/journey/route.test.ts src/components/useLiveRequest.test.ts
# 5 passed files, 53 passed tests (before the existing cooldown regression was found)

npm test -- src/components/useDeparturesRequest.test.ts src/components/useLiveRequest.test.ts
# 2 passed files, 15 passed tests
```

The full test suite initially found a manual-cooldown regression. Root cause: the
new server retry window was sharing the existing manual-cooldown reference. The
minimal fix used a separate `serverRetryUntil` reference; the focused regression
command above passed afterward.

## GREEN — required full gates

```sh
npm run typecheck
# exit 0

npm run lint
# exit 0

npm test
# 29 passed files, 220 passed tests

npm run build
# Next.js production build completed; both API routes remain dynamic

npm run test:e2e
# 40 passed tests across mobile Chromium and WebKit
```

The first sandboxed E2E attempt could not bind `127.0.0.1:3100` (`EPERM`). The
same required command was rerun with approved local-port permission and passed.

## Self-review

- Confirmed both public route handlers check the injected limiter before validation
  or provider work, return no-store 429 responses, and preserve existing error
  contracts for all other paths.
- Confirmed live arrivals remain `cache: "no-store"`; the overlap map stores only
  unsettled promises and deletes entries in both resolve and reject branches.
- Confirmed diagnostic records contain only their fixed fields. The redaction test
  supplies a credential-bearing URL, raw location, and payload and verifies none
  can appear in the resulting record.
- Confirmed no `NEXT_PUBLIC_*` TfL key was introduced. The only `app_key` occurrence
  remains the existing server-only request construction; it is never logged.
- Ran `git diff --check`; it reported no whitespace errors. `.gitignore` remains
  unmodified by this task and will not be staged.

## Concerns

- The default rate-limit adapter is intentionally allow-all. A production deploy
  must inject a distributed limiter at hosting or middleware level; this task does
  not provision external rate-limit infrastructure.
- Server diagnostics are intentionally concise and do not contain payload-level
  troubleshooting data. This is the security trade-off required to prevent secrets
  and location data from entering logs.

## Fix Round 1 — Review findings

### Changes

- Moved diagnostics around the complete TfL fetch-and-validation operation. A
  malformed successful response now logs its normalized `upstream`, `topology`, or
  `timetable` failure rather than a false success. Journey topology fallback now
  retains a sanitized failure solely for its `journey_topology` diagnostic.
- Restricted diagnostic operations to a closed allowlist. Unknown values, including
  credential-bearing strings, normalize to `unknown` before logging.
- Split rate limiting into `rate-limit-contract.ts` (browser-safe constants and
  parser) and `rate-limit-server.ts` (the `server-only` adapter and allow-all
  default). Route handlers import the server adapter; browser code imports only the
  public contract.
- Re-keyed the active rate-limit issue during the server retry window. A newly
  selected station or journey now receives the remaining retry guidance and can
  fetch immediately after the window expires. Added documentation to the internal
  `RateLimitError` class.
- Added rendered Home coverage for the alert role, exact 429 guidance, stale-data
  labels, disabled Retry during the window, and its re-enablement at 30 seconds.

### RED evidence

Command:

```sh
npm test -- src/lib/tfl/client.test.ts src/lib/tfl/diagnostics.test.ts src/lib/rate-limit-contract.test.ts src/app/api/journey/route.test.ts src/components/useLiveRequest.test.ts src/components/Home.test.tsx
```

Relevant expected failures before implementation:

```text
rate-limit-contract.test.ts: Failed to resolve import "./rate-limit-contract"
diagnostics.test.ts: expected operation "unknown", received credential-bearing URL
client.test.ts: expected errorCategory "upstream", received "none"
journey/route.test.ts: expected errorCategory "topology", received "none"
useLiveRequest.test.ts: expected "rate_limited", received null after key change
```

The new rendered Home test initially found two intentional stale labels (the alert
and the board status); its assertion was corrected to require both labels. This was
a test-selector correction, not a production behavior change.

### GREEN coverage and commands

Focused command:

```sh
npm test -- src/lib/tfl/client.test.ts src/lib/tfl/diagnostics.test.ts src/lib/rate-limit-contract.test.ts src/app/api/journey/route.test.ts src/components/useLiveRequest.test.ts src/components/Home.test.tsx
# 6 passed files, 111 passed tests
```

Covering files:

- `src/lib/tfl/client.test.ts` — malformed validated payload diagnostics.
- `src/lib/tfl/diagnostics.test.ts` — URL, credential, headers, location, payload,
  and arbitrary-string redaction.
- `src/lib/rate-limit-contract.test.ts` — browser-safe exact JSON contract.
- `src/app/api/journey/route.test.ts` — rejected live topology fallback diagnostic.
- `src/components/useLiveRequest.test.ts` — 429 parser and re-keyed retry window.
- `src/components/Home.test.tsx` — rendered alert and Retry accessibility behavior.

### Full verification

```sh
npm run typecheck
# exit 0

npm run lint
# exit 0

npm test
# 30 passed files, 225 passed tests

npm run build
# Next.js production build completed; both API routes remain dynamic

npm run test:e2e
# 40 passed tests across mobile Chromium and WebKit
```

### Review notes

- `git diff --check` passed. No `NEXT_PUBLIC_*` key, upstream URL, request header,
  credential, raw location, or payload is accepted into a diagnostic record.
- The server adapter remains intentionally allow-all by default; a distributed
  hosting/middleware limiter remains a production integration requirement.
- The unrelated pre-existing `.gitignore` change remains unstaged.
