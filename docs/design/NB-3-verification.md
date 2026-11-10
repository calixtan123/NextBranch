# NB-3 native setup and verification

NextBranch uses React Native with TypeScript and Expo SDK 58 for iPhone only. The minimum deployment target is iOS 16.4. The application identifier is `com.nextbranch.app`. Expo generates the iOS project locally. The UI supports portrait and landscape and uses the system appearance. The visual authority is NextBranch_1 revision `470675179488563200` in the pinned MagicPath reference.

## Local setup

- Run `cd native && npm ci` with Node 24. Run `npm run ios` to generate and install a local development build. Run `npm start` to serve that build during development.
- Supply the public server origin in `EXPO_PUBLIC_NEXTBRANCH_API_URL`. Production requires an absolute HTTPS origin. TfL credentials stay on the server.
- Start the fixture preview with `EXPO_PUBLIC_NEXTBRANCH_FIXTURE=three-card-home EXPO_PUBLIC_NEXTBRANCH_SEED=1 npm run ios`. Remove the seed flag for an empty first fixture launch. Fixture preferences use a separate storage key. The preview clock is 2026-09-16 12:00 UTC, which is 13:00 in London.
- The production catalogue contains six reviewed Colindale and Camden Town tuples. Other stations open the recoverable catalogue message. The reviewed source and selected records are in [platform-catalogue-evidence.json](platform-catalogue-evidence.json).

## Implementation

Home, Platform departures, Search stations, Select platform, Manage/Replace platforms, Settings, Appearance and Card display share a native stack. Home and detail use the same board renderer. Amber uses the pinned 5 × 7 dot glyphs and switches to scalable native text at accessibility sizes or for unsupported characters. Rows wrap to keep destination and advertised branch wording together. The app uses the system theme, safe areas, Reduce Motion setting and native scrolling.

The preference owner holds ordered platform tuples, styles and recents. Writes are serialized. Unknown versions or unreadable storage leave a usable session with a persistence warning. Previously saved tuples missing from the reviewed catalogue remain visible as review entries and make no station requests. Undo is offered for five seconds. If activated in time at capacity, its replacement choice stays available until confirmed or cancelled.

The request owner keeps matching station snapshots in memory. It coalesces manual and polling triggers, applies one shared 429 deadline, cancels released stations and resumes visible ones. Home projects three rows and the expanded board projects five after expiry and exact platform filtering. London arrival times on detail use the shared time helper.

## Commands and results

Commands were bounded with a Perl alarm on this macOS host. The native package uses Expo 58.0.23, React Native 0.88.1, TypeScript 6.0.3 and Vitest 5.1.0. The deployment floor comes from the [Expo SDK 58 support matrix](https://docs.expo.dev/versions/v58.0.0/).

| Directory | Command | Result |
| --- | --- | --- |
| `native/` | `npm install` and `npx expo install react react-native @types/react @react-native-async-storage/async-storage react-native-safe-area-context react-native-svg @react-native-community/netinfo expo-dev-client expo-system-ui` | Exit 0 |
| `native/` | `npx expo install react-native-screens` and `npx expo install typescript --dev` | Exit 0 |
| Isolated copy of native manifests | `npm ci` | Exit 0 |
| `native/` | `CI=1 npx expo install --check` | Exit 0 |
| `native/` | `npm run typecheck` | Exit 0 |
| `native/` | `npm test` | Exit 0, 22 tests after final review fixes |
| `native/` | `CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid EXPO_PUBLIC_NEXTBRANCH_FIXTURE=three-card-home EXPO_PUBLIC_NEXTBRANCH_SEED=1 npm run export:ios` | Exit 0 |
| Root | `NEXT_TELEMETRY_DISABLED=1 npm run verify` | Exit 0, 260 tests |
| Root | `NEXT_TELEMETRY_DISABLED=1 npm run build` | Exit 0 |
| Root | `git diff --check` | Exit 0 |
| Root | `npm run test:e2e` | Exit 0, 40 browser tests |

The production Hermes bundle passed a string scan for fixture IDs, scenario names and the fixture storage key even with both fixture environment flags set during export.

The initial native runs exited 1 before the owners existed. A second red run had 13 passing tests and two failing cases for held Undo and exposing a shared 429 to newly owned stations. The owner changes turned both green. The 18-test run includes the preparation fixtures, an isolated Camden failure, fresh empty Camden A, offline catalogue search, storage failures, late response cancellation, exact filtering, rounded Due expiry, London DST and large-text fallback selection.

Root verification initially exited 1 because the Vitest alias contained an encoded worktree path. Resolving the alias with `fileURLToPath` restored all 34 suites. The native Expo dependency tree has five moderate audit findings in CLI/fingerprint dependencies.

The scoped independent review identified and verified two fixes: exact expiry at +30,001 ms (Due remains through +30,000 ms inclusive), and duplicate saves returning Home while retaining order/style. Native regression tests now total 20. The browser suite initially could not bind its temporary server under the sandbox (EPERM); a permitted host run passed all 40 tests without application changes. These browser tests cover the existing web app and do not establish native UI acceptance.

The fresh whole-branch reviewer identified missing keyboard insets and incorrect Amber character advance. The final fix enables native keyboard insets and derives rendering/wrapping from the pinned 12.65-point advance. Two red/green metric regressions bring the native suite to 22 passing tests. The controller reran the full native suite, typecheck and iOS export after these changes; all exited 0. Modern text shadows, the card shadow and Amber glow are restored in source. Scoped re-review accepted the source fixes without new actionable findings. The SVG combines lit dots before blurring, whereas the design composites each dot's CSS shadow; rendered equivalence and native filter performance remain unverified.

Independent review is accepted at source level only. Neither the reviewer nor the controller has approved the required native screenshot comparison or interaction matrix. Publication must remain a draft and NB-3 must remain In Progress until these acceptance checks pass.

## Device and live acceptance

The worker ran the static export and tests. The parent owns Simulator screenshots and walkthroughs, including search and keyboard handling, drag and Undo, both board styles, appearance, app restart and the small/large iPhone matrix. Physical-iPhone VoiceOver, maximum Dynamic Type, Reduce Motion and intermittent connectivity need device evidence. The live API and catalogue outside Colindale and Camden Town remain separate acceptance checks.
