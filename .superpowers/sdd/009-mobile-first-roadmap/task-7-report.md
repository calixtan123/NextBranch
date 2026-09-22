# Task 7 report — Native sharing with clipboard fallback

## Implementation summary

Added a quiet Share action for an active departure station and an active journey.
`ShareControl` is a small client component because it needs browser-only APIs:
`window.location.origin`, the Web Share API (`navigator.share`), and the Clipboard
API. It builds an absolute root URL from only the canonical station or journey
selection parameters:

- Station: `/?station=<station-id>`
- Journey: `/?from=<station-id>&to=<station-id>`

The control prefers native sharing. An `AbortError` (the standard signal that a
person closed the native share sheet) is deliberately neutral: it shows no error
and does not copy unexpectedly. Other native-share failures fall back to copying
the same canonical URL. Clipboard success announces exactly `Link copied` in an
accessible status region. If neither browser route works, an accessible alert
states `Unable to share link.` while the existing station/journey results remain
on screen.

The Share button is exposed only for an active station board or an activated
journey result. The existing compact action areas wrap on a narrow screen rather
than introducing horizontal overflow. The browser history test now waits for the
journey URL before calling Back; this prevents a WebKit timing race where the
visible results state could arrive before its corresponding history entry.

## Files changed

- `src/components/ShareControl.tsx` — client-only canonical URL construction,
  native share, clipboard fallback, and accessible feedback.
- `src/components/ShareControl.test.tsx` — canonical station/journey URLs,
  native success, cancellation, rejection/fallback, clipboard success, and
  total-failure coverage.
- `src/components/Home.tsx` — renders Share only for active station and journey
  selections.
- `src/components/Home.test.tsx` — verifies active-only exposure and that a
  share failure preserves visible departures.
- `src/app/styles.css` — compact action grouping and narrow-screen wrapping.
- `e2e/mobile.spec.ts` — validates shared URLs reopen in a clean browser state
  for both station and journey; waits for the journey history entry before Back.
- `.superpowers/sdd/009-mobile-first-roadmap/task-7-report.md` — this report.

The unrelated user-owned `.gitignore` addition for `/todo/` was preserved and
was not staged or committed.

## Focused RED evidence

The inherited partial Task 7 production behavior was temporarily backed out while
keeping the Task 7 tests. This was necessary to obtain fresh, honest test-first
evidence; no historical RED evidence is claimed.

Command:

```text
npm test -- src/components/ShareControl.test.tsx src/components/Home.test.tsx
```

Result:

```text
Test Files  2 failed (2)
Tests  9 failed | 51 passed (60)
Exit 1
```

Expected missing-feature failures included `buildShareUrl` returning only the
origin instead of canonical parameters and the absence of accessible Share
buttons in `ShareControl` and `Home`. The failures therefore demonstrated the
missing feature, rather than a test harness/setup error.

## Focused GREEN evidence

After implementing the minimum behavior, and again after the final directive
placement correction, the focused component command was:

```text
npm test -- src/components/ShareControl.test.tsx src/components/Home.test.tsx
```

Result:

```text
Test Files  2 passed (2)
Tests  60 passed (60)
Exit 0
```

Focused real-browser share/deep-link verification:

```text
npm run test:e2e -- --grep 'shares canonical links that reopen in clean state'

Running 2 tests using 2 workers
2 passed (4.4s)
Exit 0
```

## Verification commands and exact results

Final-tree verification was run after correcting the required Next.js client
directive placement (`"use client"` at the first line of `ShareControl.tsx`).

```text
npm run verify

Test Files  25 passed (25)
Tests  188 passed (188)
Exit 0
```

This command includes `tsc --noEmit` and `eslint .`; both completed without
errors before Vitest ran.

```text
npm run build

✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages using 7 workers (4/4)
Routes: /, /_not-found, /api/departures, /api/journey, /manifest.webmanifest
Exit 0
```

```text
npm run test:e2e

Running 40 tests using 2 workers
40 passed (15.8s)
Exit 0
```

The full browser gate exercised mobile Chromium and mobile WebKit, including the
new canonical-share/clean-state scenario plus the existing 320px and 390px Axe
accessibility and overflow checks.

Additional diagnostic/recovery evidence:

```text
npm run test:e2e -- --project=mobile-webkit --grep 'back and forward restore station and journey deep links'

1 passed (2.9s)
Exit 0
```

Before the final tree, `npm run build` correctly failed because an intermediate
edit placed `"use client"` at line 88. The Next.js error identified the exact
root cause; moving it to line 1 was the only code correction. Before adding the
journey-URL wait, two parallel WebKit full-suite attempts reported the existing
history test still in the Results view after Back, while that exact test passed
in isolation. The test now waits for the URL history entry that `router.push`
creates before calling Back; the final complete two-browser run passed.

## Self-review findings

### Behaviour

- Native share receives an absolute URL made from `window.location.origin` and
  exactly one canonical selection envelope.
- Native success stops without fallback feedback; cancellation is neutral; an
  ordinary native failure falls back to clipboard; two failures show the concise
  alert and preserve results.
- Active-only placement prevents sharing a saved/recent row or inactive chooser
  state.
- No API call, data refresh, route mutation, or result state is discarded by the
  share action.

### Accessibility and responsive layout

- The visual `Share` text has a descriptive accessible name including the active
  station or journey.
- Copy success uses `role="status"`; unrecoverable failure uses `role="alert"`.
- The inherited button rule retains a minimum 44px target and the shared focus
  style.
- Action areas use `flex-wrap`; mobile 320px/390px overflow and Axe checks
  passed in both browser engines.

### Scope and data safety

- URL construction does not read the current path/query string, live departure
  payload, raw location, local storage, cookies, credentials, or environment
  values. It serializes only canonical station IDs.
- No production configuration, deployment configuration, service worker, or API
  route was changed.
- `git diff --check` returned exit 0; no whitespace errors were found.
- The `/todo/` `.gitignore` change remains outside this task's commit.

## Concerns

None remaining. The final full verification, production build, and both mobile
browser projects pass. Playwright emitted the pre-existing harmless
`NO_COLOR`/`FORCE_COLOR` environment warning; it did not affect results.

## Fix Round 1

### What changed

Added the repository-required concise JSDoc module comments to the two new
Task 7 modules only:

- `src/components/ShareControl.tsx` now documents that it owns canonical
  station/journey sharing through browser-native APIs. The `"use client"`
  directive remains the file's first statement, as required by Next.js.
- `src/components/ShareControl.test.tsx` now documents that it verifies
  canonical sharing, native browser handling, and clipboard fallback feedback.

### Covering tests and checks

```text
npm test -- src/components/ShareControl.test.tsx

Test Files  1 passed (1)
Tests  7 passed (7)
Exit 0
```

```text
npm run typecheck

> tsc --noEmit
Exit 0
```

```text
npm run lint

> eslint .
Exit 0
```

### Scope check

No sharing behavior, styles, browser tests, configuration, or `.gitignore`
content changed in this fix round.
