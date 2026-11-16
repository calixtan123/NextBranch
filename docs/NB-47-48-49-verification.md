
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


## NB-49 existing configuration and documentation review

### Exact baseline and imported changes

Read-only SHA-256 comparison on 15 November 2026 confirmed that all five captured baseline files were byte-identical to the corresponding files in `/Users/calixtan/personal-projects/tfl-tracker`. The captured patch records the three tracked changes, and the captured directory also records the two untracked files. The table records the captured baseline and the reviewed worktree content.

| File | Captured baseline SHA-256 | Reviewed SHA-256 |
| --- | --- | --- |
| `native/app.json` | `f34c562dcc95a13ca59f2bc58f23e0c2a1ca22cc2d167120f236ae1d3654e379` | `f34c562dcc95a13ca59f2bc58f23e0c2a1ca22cc2d167120f236ae1d3654e379` |
| `eslint.config.mjs` | `8e55ce6988a105bba7b8fd203989f1a1df541d4b956fb9b7200259398f57a16c` | `8e55ce6988a105bba7b8fd203989f1a1df541d4b956fb9b7200259398f57a16c` |
| `docs/TFL_STATION_PLATFORM_CATALOGUE.md` | `006cb3eb765e434c2ab74c38cae896c4079c74f74e154cb9e75365f4ed769bbc` | `e72f01c9e9794c0253ddec26aba74da2ddd93ad4754620ecae6e41b0e394dac5` |
| `GLOSSARY.md` | `eb62f4013f5344824a08a7d2447cdd7bf4537413e986b316a7b9ccf982659a6b` | `eb62f4013f5344824a08a7d2447cdd7bf4537413e986b316a7b9ccf982659a6b` |
| `tests/release/test_lint_scope.py` | `6f8118121c7955ffc98c0724ff3428d83c3a6bad45068a08aa4acc0c83977840` | `6f8118121c7955ffc98c0724ff3428d83c3a6bad45068a08aa4acc0c83977840` |

`native/app.json`, `eslint.config.mjs`, `GLOSSARY.md` and `tests/release/test_lint_scope.py` were imported byte-for-byte. The catalogue import preserves the author's decisions and wording, with one correction to the final design-review checkpoint. It now records that catalogue/search/server/native integration exists in current source and points to the delivered NB-5 through NB-13 evidence. Earlier ticket sections retain their historical delivery context.

The glossary and catalogue decisions agree with `src/lib/catalogue/index.ts` passenger filtering, `src/lib/catalogue/capability.ts` per-service feed/mapping evidence, `native/src/catalogue.ts` physical-platform identity and static Save eligibility, and the native search/detail/board presentation. Shared platforms retain published services, Save needs at least one supported verified service, and empty/outage responses preserve that eligibility. National Rail-only platforms are filtered, National Rail departure integration is unsupported, and cable-car capability remains unverified.

### Existing Expo project and encryption rationale

Parent-authenticated read-only EAS CLI verification on 15 November 2026 returned username `calixtan`, project `@calixtan/nextbranch-iphone` and project ID `5b3e4c9b-dcdf-4fec-97f0-55aa1d6a613a`. The baseline owner/project configuration matches that existing link. Bundle identifier `com.nextbranch.app` and app version `0.0.1` match current main and release documentation. `native/README.md` now uses `whoami` and `project:info` to verify this existing link during setup.

The retained `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` declaration is supported by the reviewed app and installed dependency paths. `native/src/api.ts` uses `fetch` and requires HTTPS outside development. The installed React Native 0.88.1 `Libraries/Network/RCTHTTPRequestHandler.mm` uses Apple's `NSURLSession` for HTTP/HTTPS. `native/src/runtime.ts` wires AsyncStorage 2.2.0 for preferences. Its `ios/RNCAsyncStorage.mm` writes UTF-8 strings and uses `RCTMD5Hash` for file names, whose installed React Native implementation calls Apple's `CC_MD5`. Expo Modules Core's installed `ios/Uuidv5/Uuidv5.swift` calls Apple's `CC_SHA1` for identifier generation. The reviewed native source/dependency declarations expose operating-system networking and hash uses. The README explains that rationale and the release archive check. Apple guidance includes encryption used by third-party libraries. [Apple encryption export guidance](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations) · [Apple declaration key](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption) · [Expo app configuration](https://docs.expo.dev/versions/latest/config/app/)

### Verification on 15 November 2026

The imported pytest regression uses Arrange / Act / Assert. Its six input paths arrange root/native/generated/worktree cases, ESLint's real `isPathIgnored` method exercises configuration, and assertions check the resulting scope.

- Regression-first `PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/release/test_lint_scope.py` exited 1 before importing the reviewed ESLint configuration. The two worktree cases failed and four existing-scope cases passed.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/release/test_lint_scope.py tests/release/test_native_release.py` exited 0 with `76 passed in 10.41s`, including all six lint-scope cases and 70 release/configuration cases.
- `npm run lint` exited 0 using `eslint .`.
- `npm --prefix native run typecheck` exited 0 using `tsc --noEmit`.
- Local `expo/config` `getConfig` evaluation from `native/` exited 0 in development and production-gate environments. Assertions confirmed owner, slug, project ID, bundle identifier, version and the Boolean encryption declaration in both resolved configurations. The production evaluation used `https://api.nextbranch.app` solely as a config-test input. The exact script is in the task report.
- `git diff --check` exited 0 after the final documentation edits.

### Scope and release limitations

The source/dependency review and local config evaluation establish the repository declaration. The signed archive's actual linked dependencies, generated Info.plist, Apple Developer/App Store Connect ownership, signing, upload acceptance and runtime encryption behavior remain release acceptance under NB-27/NB-30/NB-54. The parent owns coherent commits, publication, Jira evidence and completion transitions. The implementation worker preserved both dependency symlinks and the primary checkout.


## Integrated controller verification

After all three ticket implementations, `npm --prefix native test -- --configLoader runner` exited 0 with 465 tests across 18 files passing. `npm run typecheck` exited 0, and `npm test -- --configLoader runner` exited 0 with 458 tests across 40 files passing. The runner loader preserves the existing external dependency symlinks. Hosted CI will verify the published commit, including builds, browser tests and iOS export.
