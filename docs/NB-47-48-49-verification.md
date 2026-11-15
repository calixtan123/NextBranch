
## NB-47 API recovery

### Implementation

The App treats only `isConnected === false` as offline. Unknown connectivity and a false `isInternetReachable` value allow the configured API transport to establish availability. Existing station-owner cancellation, request deadlines, shared ownership, retry scheduling and foreground refresh remain in use.

Before the live NetInfo subscription, the App calls `NetInfo.configure({ reachabilityShouldRun: () => false })`. Synthetic fixtures skip both configuration and subscription. The configuration retains the library's native reachability default.

### Installed NetInfo source evidence

Reviewed installed `@react-native-community/netinfo` 12.0.1. `src/internal/defaultConfiguration.ts` lines 4–5 define `https://clients3.google.com/generate_204` with HEAD, and line 14 enables native reachability. `src/internal/internetReachability.ts` lines 57–65 start the fallback HTTP check only when `reachabilityShouldRun()` returns true. Lines 148–157 use native boolean reachability when available and otherwise select that fallback. `src/index.ts` lines 37–51 merge configuration with defaults and can replace existing listeners, so configuration precedes subscription.

This establishes the source-level suppression of the library's fallback HTTP request. Physical filtered-network behaviour and release-device traffic capture remain unverified. The existing About privacy wording is preserved pending release-device evidence and NB-31/NB-53 coordination. Physical acceptance remains with NB-32.

### Verification on 15 November 2026

Tests use Arrange / Act / Assert. They set native callback inputs, exercise the App with the real station owner, and inspect resulting request and snapshot state.

- Regression-first run `npm --prefix native test -- --configLoader runner tests/app-navigation.test.ts` exited 1 with five expected failures and eight passes. False reachability blocked successful API results and reconnect recovery, the API-failure path never ran, and NetInfo configuration was absent.
- Final focused run `npm --prefix native test -- --configLoader runner tests/app-navigation.test.ts tests/departures.test.ts` exited 0 with 104 tests across two files passing. Coverage includes false/unknown reachability, explicit disconnect cancellation and suspension, reconnect, foreground recovery after API failure and the real request timeout, configuration order, native subscription cleanup, fixture isolation and existing shared-owner guarantees.
- Full native run `npm --prefix native test -- --configLoader runner` exited 0 with 448 tests across 18 files passing in the shared worktree at this verification point.
- `npm --prefix native run typecheck` exited 0.
- The initial default-loader command `npm --prefix native test -- tests/app-navigation.test.ts` exited 1 before tests because Vite attempted a config cache write through the existing dependency symlink outside writable roots. The runner loader avoids this write and preserves the symlinks.

- NB-47 `git diff --check` exited 0 with no whitespace errors.


## NB-48 rate-limit cooldown presentation

### Implementation

`boardStatus` accepts the existing shared owner cooldown as an optional argument. Status precedence is explicit offline connectivity first, invalid selection and configuration errors next, then cooldown, request errors, selected-feed availability and freshness. During cooldown the warning status reads “Updates paused. Retrying shortly.” on initial and cached boards.

Home and expanded departures show one “Refresh is paused until automatic retry.” guide while pull-to-refresh and the detail Refresh action are disabled by the existing owner state. The guide is suppressed for offline, invalid and configuration states. The shared station owner's retry deadline, polling, transport fallback and snapshot retention continue to control recovery.

Compact boards include the cooldown text once in their grouped accessible name. Expanded boards expose the visible cooldown text as the accessible status and hide the redundant status dot from accessibility during cooldown. Both Amber and Modern use their existing layout, typography and colors. The message wraps at accessibility text sizes. Existing absolute-arrival expiry and snapshot freshness calculations continue while updates are paused.

### Verification on 15 November 2026

Tests use Arrange / Act / Assert. They configure owner or shallow native boundary inputs, exercise the transport/owner/model or screen, then inspect timing, retained rows, labels and control state.

- Regression-first native run `npm test -- --configLoader runner tests/departures.test.ts tests/platform-board-layout.test.ts tests/live-screens.test.ts` from `native/` exited 1. Eleven regression tests failed and 193 existing tests passed. Failures showed generic/loading status, missing cooldown messages in both styles, and absent disabled-refresh guidance.
- Final focused run `npm --prefix native test -- --configLoader runner tests/departures.test.ts tests/platform-board-layout.test.ts tests/live-screens.test.ts` exited 0. All 207 tests across three files passed.
- Coverage includes initial/cached HTTP 429, valid 45-second Retry-After, missing/malformed header fallback of 30 seconds, duplicate station ownership, newly owned stations during shared cooldown, manual-refresh suppression, automatic retry expiry, successful recovery, cached row expiry/freshness, status precedence, both styles, Home/detail accessible output and one screen-level refresh guide.
- `npm --prefix native run typecheck` exited 0.
- `git diff --check` exited 0.
- `/Users/calixtan/.agents/skills/impeccable/scripts/impeccable detect --json native/src/PlatformBoard.tsx native/src/LiveScreens.tsx` exited 0 and returned `[]`.
- Two test invocations accidentally used the root working directory without `--prefix native`. Both exited 1 with “No test files found”. The native commands above produced the regression and passing evidence.

### Limitations

The native tests inspect component output through shallow native boundaries. Physical-device VoiceOver speech, focus behavior, actual native wrapping and rendered screenshots remain unverified and belong in NB-32 device acceptance. No new spoken announcement side effect was introduced. The status is exposed through existing readable text and accessible card grouping. The parent will run the final integrated native suite after all ticket work is reviewed.
