
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
