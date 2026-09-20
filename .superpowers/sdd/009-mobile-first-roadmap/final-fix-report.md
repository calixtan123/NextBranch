# Northern Direct Tasks 1–7 final fix report

Date: 2026-09-20

Branch: `feat/mobile-first-roadmap`
Starting HEAD: `0d415efc7d1237d5ed77f78f07c9dffa4f4f9599`

## Outcome

This consolidated wave addresses all three final-review findings for Tasks 1–7:

1. The named browser live-request deadline is now 20,000 ms. This permits the journey handler's legal sequential route-lookup and arrivals/timetable phases to finish while remaining below the 30-second poll interval.
2. An active departure board that is not already saved now exposes a quiet `Save station` action. It saves through the existing canonical storage layer, does not create duplicate saved entries, does not reactivate or refetch the board, persists across remounts, and uses the existing five-second Undo/status convention.
3. The requested module/function documentation is present in `InstallHint.tsx`, `stations.test.ts`, and `e2e/local-resource.ts`. The client directive remains the first statement in `InstallHint.tsx`.

## Implementation details and files

- `src/components/useLiveRequest.ts`
  - Changed `LIVE_REQUEST_TIMEOUT_MS` from 12,000 to 20,000.
  - Updated the rationale to describe the two sequential server stages.
  - Left cancellation, keyed stale-data retention, in-flight cleanup, retry, and 30-second polling mechanics unchanged.
- `src/components/useLiveRequest.test.ts`
  - Added a fake-timer regression that models 7,999 ms of route lookup followed by 7,999 ms of failed optional destination/timetable work and a valid degraded response.
  - Updated all timeout boundary and cleanup assertions from 12 seconds to 20 seconds, including the simultaneous offline/timeout race.
- `src/components/Home.tsx`
  - Added `Save station` only for an active, not-currently-saved board.
  - Reused `saveStation`, `writeStations`, the shared station collection ref, the existing accessible station status region, and the existing five-second `UndoExpiry` convention.
  - A clean incoming URL records no Recent entry until the passenger explicitly saves.
  - Undo restores the exact prior membership. A station never stored before the save is removed entirely on Undo rather than incorrectly becoming Recent.
  - At the five-station limit, Undo also restores any saved/recent row displaced by the new save.
- `src/components/Home.test.tsx`
  - Proves a clean shared URL can save without combobox reselection, performs no extra live fetch, survives remount, avoids duplicate membership, stays removed across another remount, and uses correct Undo behavior.
  - Covers capacity-aware Undo restoration.
- `src/components/InstallHint.tsx`
  - Added a concise module responsibility comment after the first-statement `"use client"` directive.
- `src/lib/storage/stations.test.ts`
  - Added a concise module responsibility comment.
- `e2e/local-resource.ts`
  - Expanded `getLocalResource` documentation with NumPy-style Parameters, Returns, and Raises sections, explicitly documenting origin and redirect rejection.

The unrelated user-owned `.gitignore` `/todo/` change was preserved byte-for-byte and was not edited for this wave.

## Honest RED evidence

### Browser deadline

Command:

```text
npm test -- src/components/useLiveRequest.test.ts
```

Result: expected RED, exit 1. Vitest ran 11 tests: 1 failed and 10 passed. The new staged-pipeline test failed at 15,997 ms because `loading` was already `false` (`expected false to be true`), proving the old 12-second deadline aborted a still-valid journey response.

### Clean shared-board save

Command:

```text
npm test -- src/components/Home.test.tsx -t "saves a clean shared station board|undoes a clean shared station save"
```

Result: expected RED, exit 1. Both selected tests failed because no accessible `Save station` button existed. The rendered board still had the active station, Share, Refresh, and combobox, showing the failure was the missing action rather than broken test setup.

### Capacity-aware Undo

Command:

```text
npm test -- src/components/Home.test.tsx -t "restores the displaced station when undoing an active-board save at capacity"
```

Result: expected RED, exit 1. The comparison showed the prior Edgware Recent row was absent after Undo. This isolated the partial-Undo bug introduced by adding a sixth distinct station at the five-row boundary.

## GREEN and focused evidence

Command:

```text
npm test -- src/components/useLiveRequest.test.ts src/components/Home.test.tsx -t "accepts a valid response|ends a hung refresh|saves a clean shared station board|undoes a clean shared station save|restores the displaced station"
```

Result: exit 0; 5 selected tests passed across 2 files (62 unrelated tests skipped by the filter).

Command:

```text
npm test -- src/components/useLiveRequest.test.ts src/components/Home.test.tsx src/lib/storage/stations.test.ts e2e/local-resource.spec.ts
```

Result: exit 0; 3 Vitest-owned files and 72 tests passed. `e2e/local-resource.spec.ts` is a Playwright file and therefore was not collected by Vitest; it remained part of the later E2E command.

Command:

```text
npm run typecheck && npm run lint
```

Result: exit 0; TypeScript and ESLint completed with no diagnostics.

## Required final commands

### `npm run verify`

Result: exit 0.

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 25 files passed, 192 tests passed, 0 failures.

### `npm run build`

Result: exit 0. Next.js 16.3.5 compiled successfully, completed TypeScript, generated all 4 static pages, and retained `/api/departures` and `/api/journey` as dynamic routes.

### `npm run test:e2e`

Result: environment-blocked before test collection, exit 1. Playwright's configured web server could not bind `127.0.0.1:3100`:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:3100
```

No browser test ran and no application assertion failed. Per the task instruction, this was not retried inside the sandbox; the controller can rerun with port-binding approval.

### Diff hygiene

Command:

```text
git diff --check
```

Result: exit 0; no whitespace errors.

## Self-review

- Safety and data integrity: saving goes through canonical station validation and the bounded station envelope. No live predictions, URLs beyond the canonical station ID, credentials, or other request data are persisted.
- Deadline lifecycle: the change adjusts only the named duration. Existing tests still cover success, response-body stalls, HTTP failures, key changes, inactive views, offline transitions, unmount, stale retention, coalescing, and retry cleanup.
- Inactive fetches: saving changes only station membership state. It does not change `boardStation`, view, URL, or request-hook inputs. The regression explicitly holds the departure fetch call count steady during Save and Undo.
- Persistence and Undo: a pre-hydration click re-reads the current store through the existing update boundary, so an already-saved station is not duplicated. Clean saves undo to no membership, recent saves undo to Recent, and capacity displacement is restored without replacing newer unrelated state wholesale.
- Accessibility and responsive behavior: the action is a native button using the existing `.text-button` vocabulary. Global button rules retain the 44px minimum height and visible focus ring. The existing wrapping `.result-actions` layout accommodates the additional action at narrow widths. Status feedback and Undo retain their named live region.
- React/Next lifecycle: no new effect, event listener, interval, or timeout was introduced. The new callbacks use existing collection refs and cleanup paths. Installed Next 16 Client Component, Route Handler, and accessibility documentation was reviewed before editing.
- Scope: no API payload, routing rule, production configuration, dependency, generated artifact, deployment setting, or unrelated UI was changed. No merge, push, deploy, or publish action was taken.

## Concerns and follow-up

- The only outstanding verification is the real-browser suite, which was prevented from starting by sandbox port-binding policy. Rerun `npm run test:e2e` in an environment permitted to listen on `127.0.0.1:3100`.
- Because the server never started, the existing mobile Chromium/WebKit accessibility and 320px/390px overflow checks did not execute in this wave. Unit/component coverage and the successful production build do not replace that browser evidence.
