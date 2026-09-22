# Northern Direct final-branch recovery fix report

Date: 2026-09-22

Branch: `feat/mobile-first-roadmap`

Fix base: `a54d66be8f30854a21f1752575e7e5ee644b9851`

## Outcome

This recovered and completed the single final-review fix wave without restarting
or discarding the predecessor's work. All three requested findings are addressed:

1. Only the current opt-in geolocation lookup can act. Manual station selection,
   view navigation, URL navigation, and unmount revoke pending ownership; repeated
   clicks use latest-wins behavior. Obsolete success and error callbacks cannot
   change the active station, canonical URL, persisted history, or a newer
   confirmation.
2. Station-accessibility feed metadata rejects impossible calendar dates,
   including non-leap February 29 and February 30, as `Unknown` with
   `invalid-feed-start-date`. Valid leap dates remain valid, including timestamps
   whose timezone conversion moves the resulting UTC calendar day.
3. The TfL client comment now describes the 20-second overall browser budget and
   the journey handler's possible sequential topology then arrivals/timetable
   stages, rather than the obsolete twelve-second deadline.

The unrelated user-owned `.gitignore` addition for `/todo/` was preserved
byte-for-byte, left unstaged, and excluded from the commit.

## Recovery audit

The inherited worktree was at the requested fix base with eight modified files:
the unrelated `.gitignore` plus seven intended production/test files. The
predecessor had already added delayed-callback tests and partial production
changes. Those changes were treated as untrusted and audited in full before any
new edit.

The recovered geolocation ownership model is intentionally local:

- `NearestStationControl` owns a monotonically increasing lookup sequence.
  Each browser callback captures its lookup identity and returns immediately if
  a later lookup or cancellation has changed the sequence.
- A successful or failed current callback consumes its own identity before it
  changes UI or calls the owner. This prevents the other callback for the same
  browser request from acting later.
- The control exposes only a small `cancel()` handle to its owning view. No new
  service abstraction or coordinate persistence was introduced.
- `Home` calls that handle at the start of manual station selection and view
  navigation. A layout effect invalidates pending work when search parameters
  change while the component/control remain mounted. The control's cleanup
  invalidates work on unmount.
- Repeated nearest-station actions are latest-wins: the newest request receives
  the only valid identity. The existing explicit opt-in action remains enabled,
  and all existing poor-accuracy and close-result confirmation behavior remains.

Installed Next.js 16.3.5 documentation was checked before accepting the
navigation behavior. The `useRouter` reference documents composing
`useSearchParams` to observe client page changes, and the UI-state guide recommends
resetting preserved client state in the initiating event handler. The recovered
implementation follows both patterns: URL state changes invalidate in a layout
effect, while local navigation intent invalidates synchronously in its handler.

The calendar audit confirmed validation happens before `Date` conversion. It
checks the supplied year/month/day against Gregorian month lengths and leap-year
rules, then lets `Date` normalize only the timestamp's timezone. This avoids
comparing converted UTC components to the source calendar date.

## Honest RED and recovery evidence

The predecessor's exact RED console output is unavailable. The controller
observed a tests-only diff before the production files changed, so the chronology
reached RED, but this report does not reconstruct or invent the missing output.
When recovery began, both tests and partial production changes were present, and
the first focused run was already green: 3 files and 94 tests passed.

No uncovered fourth bug was found during the recovery audit, so no additional
test case was invented. Instead, the required fresh mutation check temporarily
removed only the two request-identity guards while leaving the delayed-callback
tests unchanged.

Command:

```text
npm test -- src/components/NearestStationControl.test.tsx src/components/Home.test.tsx -t "delayed result after unmount|older error while the current result|obsolete location|invalidates location|delayed location|latest overlapping lookup"
```

Mutation RED result: exit 1; 9 selected tests failed and 70 were skipped. The
failures were the intended behavior breaks:

- obsolete results changed manual Angel selections back to Camden Town;
- same-page URL navigation was overwritten by the delayed location;
- callbacks after Journeys navigation/unmount changed request, URL, or storage
  side effects;
- older overlapping results appended Camden Town to history and navigated after
  the newer Angel result;
- an unmounted control still called `onStation`; and
- an older timeout error replaced the current poor-accuracy confirmation.

The guards were then restored byte-for-byte.

GREEN result for the same command: exit 0; 9 selected tests passed and 70 were
skipped. This proves the delayed tests fail specifically when obsolete callbacks
regain authority and pass when request ownership is enforced.

## Focused GREEN evidence

Command:

```text
npm test -- src/components/NearestStationControl.test.tsx src/components/Home.test.tsx src/lib/northern/station-accessibility-analysis.test.ts
```

Result: exit 0; 3 files and 94 tests passed.

- `NearestStationControl.test.tsx`: 14/14 passed, including unmount and
  out-of-order error handling plus the existing unsupported-browser, validation,
  accurate-result, poor-accuracy, close-result, confirmation, and privacy cases.
- `Home.test.tsx`: 65/65 passed, including manual selection, same-page URL
  navigation, Journeys navigation, unmount, and both accurate and confirmation
  variants of overlapping lookups.
- `station-accessibility-analysis.test.ts`: 15/15 passed, including February 30,
  invalid leap days, the year-2000 leap day, and offset conversion.

Additional static checks before the full gates:

```text
npm run typecheck
npm run lint
git diff --check
```

All exited 0 with no diagnostics or whitespace errors.

## Files in the consolidated wave

- `src/components/NearestStationControl.tsx`
  - Adds request identity, current-callback guards, cleanup invalidation, and the
    narrow owner cancellation handle.
- `src/components/NearestStationControl.test.tsx`
  - Covers delayed result after unmount and an older error arriving while the
    current result awaits confirmation.
- `src/components/Home.tsx`
  - Invalidates location intent on manual station selection, view navigation,
    and search-parameter navigation while retaining the mounted control.
- `src/components/Home.test.tsx`
  - Uses delayed real browser callbacks to protect active station, canonical
    navigation, persisted history, unmount, latest-wins selection, and normal
    confirmation behavior.
- `scripts/analyze-northern-station-accessibility.mjs`
  - Validates source calendar dates before ISO conversion.
- `src/lib/northern/station-accessibility-analysis.test.ts`
  - Covers impossible February dates and valid leap-day/offset cases.
- `src/lib/tfl/client.ts`
  - Corrects the timeout rationale comment; request behavior is unchanged.
- `.superpowers/sdd/009-mobile-first-roadmap/final-branch-fix-report.md`
  - Records this recovery, verification, scope, and concerns.

## Required full gates

### `npm run verify:release`

Result: exit 0.

- TypeScript passed.
- ESLint passed.
- Vitest passed 34 files and 260 tests with 0 failures.
- Release topology-age check passed; the snapshot was 6 days old.

### `npm run build`

Result: exit 0. Next.js 16.3.5 compiled successfully, completed TypeScript,
generated all 4 static pages, and retained `/api/departures` and `/api/journey`
as dynamic routes.

### `npm run test:e2e`

The first sandboxed attempt exited 1 before test collection because sandbox
policy denied binding `127.0.0.1:3100` (`listen EPERM`). It was immediately
rerun with the required local-server permission.

Approved rerun result: exit 0; 40/40 tests passed in 16.4 seconds across mobile
Chromium and mobile WebKit. This includes both 320px and 390px overflow and
automated accessibility checks. The runner emitted the existing cosmetic
`NO_COLOR`/`FORCE_COLOR` warning; no application assertion failed.

## Self-review

- Race safety: every asynchronous geolocation success/error path checks the
  captured request identity before changing state or crossing the component
  boundary. Cancellation changes that identity synchronously.
- Navigation lifecycle: explicit local actions invalidate before changing view,
  station, history, or storage. URL-driven navigation invalidates at commit even
  when React preserves the control. Unmount invalidates without setting state.
- User behavior: location remains explicit opt-in; latest-wins repeated lookup is
  deterministic; poor accuracy and close candidates still require confirmation;
  manual search remains available; canonical URL/storage precedence is unchanged.
- Privacy: only canonical station objects cross into `Home`; raw latitude,
  longitude, and accuracy are neither routed nor persisted.
- Accessibility: the existing native button, status/alert roles, and confirmation
  actions remain. Full browser accessibility checks passed in both engines.
- Date correctness: month zero/13 and day zero/out-of-range fail through the same
  validation, 1900/2100 are not leap years, and 2000/2024 are leap years.
- Request behavior: the TfL edit is comment-only. Coalescing, cancellation,
  deadline, stale-data, retry, diagnostics, and API tests remain green.
- Scope: no dependencies, API payloads, service layers, thresholds, deployment
  configuration, generated data, or deferred ledger items were changed.
- Mutation protection: removing the identity guards recreates all relevant
  delayed-callback failures, including observable URL and storage corruption.

## Concerns

- The predecessor's exact original RED console output cannot be recovered; only
  the controller-observed tests-first chronology and this wave's fresh mutation
  RED→GREEN evidence are available.
- The Playwright runner still prints the pre-existing `NO_COLOR`/`FORCE_COLOR`
  warning. It is cosmetic and outside this fix wave.
- No functional, build, release, or browser-test concern remains for the three
  reviewed findings.
