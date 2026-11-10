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
| `native/` | `npm test` | Exit 0, 33 tests across seven files after native runtime and large-text fixes |
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

Subsequent scoped review accepted the navigation-readiness guard, Hermes-compatible search sorting and full-screen Search/Picker/Departures navigation. The controller observed Search → Camden → Platform A → five-row detail → Saved returning Home. The native suite now has 25 passing tests. The controller reports a fresh root verification (260 tests), native tests, native typecheck and iOS export, all exit 0.

Matched reference renders now cover all eight design screens. Scoped independent screenshot review accepted the Home, Manage and Card Display typography/spacing corrections: ordinary Avenir labels use weight 400, station board labels use 800, Manage has the reference's outer row spacing, and Card Display restores the Done gap. No unresolved actionable finding remains from that scoped review. Native safe areas, real system bars, 44-point action targets, explicit replacement confirmation and fixture disclosure deliberately adapt the prototype.

Source and screenshot reviews accept the implemented screens and scoped fixes. The latest local verification on 10 November passed native tests (33), native typecheck and iOS export, plus root typecheck, lint and tests (260). The PR remains draft and NB-3 remains In Progress pending the unobserved acceptance checks listed below and latest-head CI.

## Observed native runtime evidence

The following results were observed by the controller on the iPhone 18 Pro Simulator unless stated otherwise. Independent screenshot review supports the visual observations; it did not duplicate native interactions.

| Check | Result and boundary |
| --- | --- |
| Landscape keyboard and Picker | Camden result scrolled completely above the visible software keyboard; tapping it opened the current full-screen Picker. |
| Portrait last-result search and cancellation | With the software keyboard visible, scrolled the result list to Woodside Park and selected it. Unknown catalogue recovery appeared; Back returned to Search with keyboard dismissed; Cancel returned Home preserving all three cards/order. This is normal-size portrait coverage, not a small-device or maximum-text pass. |
| Drag after spacing change | Moved Colindale from first to last, preserving Camden B/A relative order. |
| Non-drag reorder | Tapped a grip, used the native Move down alert, and moved Camden B below Camden A. VoiceOver-enabled non-drag management was observed separately. Audible speech remains unverified. |
| Process restart | Terminated and relaunched the app; three cards, order and styles were restored. |
| Management states | Captured removal/Undo restoration, reordered Manage, replacement selection and explicit old/new confirmation. Subsequent controller interactions observed timed Undo disappearance and replacement Cancel preserving all three records/order. The selection/confirmation/result sequence established replacement of only the selected slot. |
| Maximum Dynamic Type | Manage and Card Display wrap without reported truncation; Card Display scrolling worked. Representative small iPhone 17e and large iPhone 18 Pro Max captures plus observed scrolling expose complete Home/detail destination, Bank/Charing Cross wording, fallback text, countdowns and lower actions. The small detail navigation title wraps midword at maximum type size, an observed layout limitation. |
| Visual comparison | Reviewed both board styles and the eight-screen reference set; post-fix Home/Manage/Card Display renders accepted. This is visual-design review, not a claim of identical raster output across native and browser font/filter engines. |

## Consolidated walkthroughs

1. **Find and save.** Controller observed empty Home → Search → station → synthetic fixture platform → preview → Save returning Home. Earlier keyboard, last-result, Back and Cancel checks passed with selections preserved. High Barnet and other unreviewed stations show the recoverable catalogue message. Successful physical-platform selection for High Barnet remains unavailable because its catalogue has not been reviewed.
2. **Compare three platforms.** Three cards and mixed Bank/Charing Cross rows were observed, and selections/order/styles survived process restart. Controlled Camden refresh failure marked both Camden cards stale while Colindale remained fresh. Camden retry cleared both warnings. Exact two-station request ownership and fresh-detail reuse are covered by deterministic owner tests.
3. **Expand and refresh.** Controller observed Search → Camden → Platform A → five-row detail → Saved → Home. Failed-refresh and retry UI outcomes were observed as above. Colindale Home and expanded detail were directly inspected again on 10 November and both retained Modern styling while the Camden Home cards retained Amber after global Amber → Modern → Custom. Exact expiry/refill, offline and background/resume rules pass deterministic owner tests. A time-advanced expiry/offline/background-resume native walkthrough remains unobserved. The fixture clock is frozen, so ordinary waiting cannot establish expiry.
4. **Manage saved cards.** Controller observed drag and native Move down reorder, VoiceOver-enabled removal/Undo, timed Undo disappearance, replacement Cancel preserving records, and explicit one-slot replacement confirmation/result. Duplicate-save navigation is protected by regression tests and the observed Saved return flow. Process restart restored selections, order and styles.

## Accessibility, device and environment boundaries

Representative small/large Simulator runs cover light/dark, portrait and landscape search/keyboard recovery, maximum-type essential route readability and scrolling. Controller observed Reduce Motion navigation on the small device and on iPhone 18 Pro Max through appearance/navigation/refresh. Maximum-type board headers reflow to full-width station/platform and line rows. These are representative checks across the recorded devices, not exhaustive device/screen combinations.

With VoiceOver enabled, accessibility inspection exposed complete destination/branch/countdown/London-time labels, checked/unchecked appearance options and no individual dot nodes. Non-drag reorder and removal/Undo were operable. Available tools expose accessibility structure but cannot hear speech. Actual spoken output, exactly one refresh-completion announcement and absence of countdown chatter remain unverified.

Physical-iPhone testing is unavailable because this session has no connected physical test device. Live-API acceptance is unavailable because no deployed NextBranch API origin and server-side TfL credentials were supplied for this native test run. All captured departure rows are explicitly labelled fixture data. Only six Colindale/Camden production tuples have reviewed provenance. Other stations remain recoverable catalogue limitations. The exact expiry/offline/background-resume native walkthrough and auditory VoiceOver check remain acceptance gates unless the user explicitly accepts that scope limitation.

The independent reviewer accepted all eight captured design screens and both board styles after typography/spacing fixes. Native safe areas, system bars, 44-point controls, explicit replacement confirmation, accessibility reflow and fixture disclosure adapt the prototype. Pixel-identical raster output is not established across browser/native font and SVG glow compositing engines. Five moderate Expo CLI/fingerprint dependency findings remain recorded. App Store/TestFlight publication and signing administration are outside this ticket.

## Retained audit evidence

Selected native captures and the final scoped review reports are committed under [NB-3-audit](NB-3-audit/README.md). The complete local capture/reference collection remains in `/private/tmp/nb3-native-audit/`. Retained reports preserve the evidence available when each was written. Later observations in this document supersede their older pending entries. Source reviews and screenshot inspection establish their stated scope, while unobserved checks above remain open.

## User-requested Manage and interface follow-up

On 10 November the user requested a working Manage handle drag, more vertical space between Home cards, and Apple-style typography, menus and search outside the departure boards. Home cards now have 18-point bottom spacing, increased from 10 points. Surrounding controls use scalable system typography, blue actions, larger list text, separators and an inset search field. Board headings retain Avenir Next and existing weights, and Amber/Modern train rendering retains its prior implementation. Shared action styling also applies to exceptional-state Retry and Review selection buttons inside cards.

The drag handle now translates its row with the gesture and uses measured variable-height row centres to choose its destination. Manage disables parent scrolling during the handle gesture and rejects responder termination requests. Release saves one changed order through the existing preference owner. Cancellation or active-handle unmount restores scrolling without saving, and stale release callbacks are ignored. Horizontal movement and movement returning to its origin suppress the tap alert. Accessible Move up/down actions and the tap alert remain available. Drag auto-scrolling is absent for the supported three-card list.

Fresh controller verification passed `npm --prefix native test` (38 tests across nine files), `npm --prefix native run typecheck`, `npm --prefix native run export:ios`, root `NEXT_TELEMETRY_DISABLED=1 npm run verify` (typecheck, lint and 260 tests), and `git diff --check`. Native responder regressions invoke the real Manage callbacks with native boundaries mocked and the real preference owner. They cover translation across variable-height rows, one saved write on release, cancellation, unmount/stale release, restored scrolling, accessible moves and tap suppression. These tests cannot establish OS-level finger gesture arbitration.

Independent task review accepted specification compliance and code quality with zero blocking findings. The controller inspected updated dark Home, Manage, Search and Settings screens on iPhone 18 Pro Max, and observed accessible Move down then Move up restoring the original order. Coordinate drag automation returned `noWindowsAvailable`, so the updated finger-drag path remains a manual acceptance check. Prior auditory VoiceOver, time-advanced expiry/offline/background-resume, physical-iPhone and live-API boundaries remain open. PR #4 remains draft and NB-3 remains In Progress.

Fresh whole-branch review accepted source specification compliance and code quality with zero blocking findings. Independent native review inspected dark Home/Manage/Settings/Search and light Search, and exercised accessible Move down/up. After its observed Reload, the controller confirmed Metro's process directory was this worktree and its served iOS bundle contained the 18-point Home gap. Exact logical-point spacing was not measured from the scaled screenshots. The reviewer inspected inline screenshots without retaining new image files. Full reports are retained in [ui-followup-review.md](NB-3-audit/ui-followup-review.md) and [ui-followup-final-audit.md](NB-3-audit/ui-followup-final-audit.md). The controller reran native typecheck/38 tests, root verification/260 tests, iOS export and diff checking on the unchanged source before publication; all passed. Latest-head CI will be recorded on the PR and Jira after publication.

## User-requested Settings Light/Dark switch

On 10 November the user requested a simple Light/Dark toggle directly in Settings. Settings now includes a native Switch labelled Dark Mode, with a scalable label, a minimum 44-point row and expanded switch touch insets. The switch reflects the effective interface palette. It remains disabled while preferences load. Using it saves an explicit light/dark interface choice through the existing version-1 preference snapshot queue. Existing storage keys, ordered selections, card styles, style mode and recents are preserved. Missing or invalid stored interface choices continue following system appearance until the user operates the switch.

The root subscribes to immutable preference snapshots using `useSyncExternalStore`. Theme changes update the palette provider, navigation colours, stack content background and StatusBar, while retaining the existing runtime and navigator identity. `Appearance.setColorScheme` applies the explicit choice to OS-owned native presentation, including alerts and keyboard where supported. Read/write failures retain the existing session-only warning and keep theme changes usable for the session. Explicit choices survive later system appearance changes and later card preference writes.

Focused tests first failed for the missing setter, Settings control and root subscription. The red run of `cd native && npm test -- tests/preferences.test.ts tests/settings-theme.test.ts tests/app-navigation.test.ts` exited 1 with four failures and nine passes. After implementation, sequential verification passed `cd native && npm test` (43 tests across ten files), `cd native && npm run typecheck`, `cd native && npm run export:ios`, root `npm run verify` (typecheck, lint and 260 tests across 34 files), and `git diff --check`, all exit 0. Logs are retained locally in `/private/tmp/nb3-theme-red.log`, `/private/tmp/nb3-theme-green-tests.log`, `/private/tmp/nb3-theme-typecheck.log`, `/private/tmp/nb3-theme-export-ios.log`, `/private/tmp/nb3-theme-root-verify.log` and `/private/tmp/nb3-theme-diff-check.log`.

The new UI tests invoke the actual Settings callback and App presentation with React hooks/native boundaries mocked, alongside the real preference owner. They verify subscription notification, both effective palettes, navigation/StatusBar/native Appearance props, stable runtime identity, preference migration, rapid serialized choices, subsequent card writes and storage failures.

Independent task and fresh whole-branch reviews passed specification and code quality with zero blocking source findings. On iPhone 17e, iOS 27.2, the final reviewer observed both theme transitions retaining Settings and updating surface/text/status-bar contrast. Subsequent Home/Search/picker/detail/Manage navigation worked. A native reorder alert rendered Light while the system stayed Dark. The reviewer saved one synthetic Colindale/Southbound/Platform A fixture card to expose that alert. That fixture card remains saved.

The controller terminated and relaunched the app in explicit Light while the system stayed Dark, then observed Light Home and the Dark Mode switch off. After switching to Dark, a second termination/relaunch restored Dark Home and the saved card. This development-client restart briefly showed a blank screen and required reconnecting to the existing Metro preview at port 8082 before Home rendered. Selected screenshots and the independent reviews are retained in [NB-3-audit](NB-3-audit/README.md). Final observed app state is Dark Home. Software keyboard appearance remains unverified because it did not appear during the review. Audible VoiceOver, physical-iPhone and existing broader acceptance boundaries remain open. PR #4 stays draft and NB-3 stays In Progress.

## Neutral glass controls follow-up

On 10 November, Home Manage platforms, Add a platform and header Search were updated to use neutral foregrounds and native Liquid Glass through SDK-compatible `expo-glass-effect` 58.0.5. The station search field uses the same material. Amber/Modern tint and rim follow the majority of effective saved card styles, including global overrides. Custom ties and empty Custom use Amber. Empty global mode follows its selected style. Dark mode uses white/neutral content, and Light uses dark content for legibility.

Both official capability checks and the current Reduce Transparency setting gate the native material. The initial surface stays opaque until that setting resolves. Failed reads preserve the fallback, later changes update it, and cleanup removes listeners. Existing navigation, search/clear callbacks, screen-reader names and 44-point minimum targets remain covered by native-boundary tests. The independent task reviewer found a maximum-text layout issue, which was fixed by bounding controls and allowing labels to shrink and wrap. The added regression failed before the fix and passed afterward.

Fresh controller verification passed native `npm test` (59 tests across 11 files), `npm run typecheck`, `npm run export:ios`, root `NEXT_TELEMETRY_DISABLED=1 npm run verify` (typecheck, lint and 260 tests), and `git diff --check`. The native build log confirms ExpoGlassEffect compilation and Build Succeeded, followed by a Simulator activation error. Subsequent installation and launch recovered the preview. The current worktree was served through temporary Metro port 8082 because the existing port 8081 preview displayed old blue controls.

Independent task and fresh whole-branch reviews passed specification and quality with zero blocking source findings. Retained iPhone 17e Dark/Amber Home captures show neutral labels and warm material accents. At maximum Dynamic Type, Manage platforms wraps within the viewport and Settings moves below. Only the top viewport was captured at maximum size. The development-client gear partly overlays Search at ordinary text size, while the maximum-size capture exposes its search icon. Text size was restored to standard Large after capture.

CUA returned a window lookup error during the closing audit. Current Light/Modern rendering, Search interaction, Reduce Transparency transitions, unsupported-OS rendering, native focus and physical-device material/performance remain unobserved. Mocked tests cover the source paths and callbacks. Existing finger-drag, audible VoiceOver, time-advanced expiry/offline/background-resume, physical-iPhone and live-API gates remain open. The install reported five moderate dependency findings. PR #4 remains draft and NB-3 remains In Progress. Selected captures and both independent reports are retained in [NB-3-audit](NB-3-audit/README.md). Latest published-head CI is recorded on the PR and Jira after publication.

Fresh controller verification after review again passed native tests (43 across ten files), native typecheck, iOS Hermes export, root verification (typecheck, lint and 260 tests across 34 files), and diff checking. Latest-head remote CI is recorded on the PR and Jira after publication.

## Compact Manage platforms and iPhone 18 simulator refresh

On 10 November, Home Manage platforms was reduced from 15- to 13-point scalable text and from a 44- to a 32-point minimum visible glass height. Horizontal/vertical padding changes from 12/9 to 8/6 points. Its outer button retains a minimum 44-by-44-point touch target, semantic label, wrapping and existing navigation. Add a platform and Search retain their sizing. Existing white/neutral foregrounds and majority Amber/Modern material accents are preserved.

Both installed iPhone 18-family apps were still using an earlier native build and cached blue-control preview. The existing devices are named iPhone 18 Pro and iPhone 18 Pro Max; no plain iPhone 18 simulator exists. The controller installed the current build containing ExpoGlassEffect on both without uninstalling or clearing their data. The existing Metro 8081 bundle still served old blue controls, so both apps were explicitly reconnected to a fresh temporary Metro 8082 preview from this worktree. Screenshots then confirmed Dark/Amber Home on Pro with its one saved Camden card, and Dark/Modern Home on Pro Max with its three saved cards and expanded Home spacing. Both show the smaller Manage glass action and unobstructed neutral Search. These observations supersede the earlier unobserved Dark/Modern Home and obscured Search capture limitations; Light rendering and Search interaction remain outside this follow-up's native verification.

Verification on the compact source passed `npm --prefix native test` (59 tests across 11 files), `npm --prefix native run typecheck`, `CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios`, and `git diff --check`. Impeccable's detector reported no findings. No numeric-prop-only test was added for this small reversible presentation refinement. The independent task review accepted specification compliance and code quality with no findings. The fresh final review and selected device captures are retained in [NB-3-audit](NB-3-audit/README.md). Latest-head CI is recorded on the PR and Jira after publication.

The apps are development clients, and a later development restart requires a running Metro preview. The temporary preview is stopped after verification under workspace process-management rules. Existing finger-drag, audible VoiceOver, time-advanced expiry/offline/background-resume, physical-iPhone and live-API acceptance gates remain open. PR #4 remains draft and NB-3 remains In Progress.
