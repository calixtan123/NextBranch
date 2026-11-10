# NB-14 native TfL colour and platform-group verification

Verified on 2026-11-10 in the existing isolated `feat/NB-14-line-platform-groups` branch, based on `377cb6e`.

## Implemented behavior

One line-ID palette supplies bordered markers for station search, picker headings, platform details and saved/expanded boards. All 21 pinned TfL identities are tested verbatim, including the six current Overground names. Unknown and National Rail service markers use neutral `#61686B`, while their published labels remain visible. Label text uses the theme foreground rather than the service colour.

The picker derives groups from exact non-National-Rail service-ID sets. Northern comes first, other Underground lines follow alphabetically, Elizabeth follows, and remaining lines are deterministic by ID. Source physical-platform order stays intact within each group. National Rail-only, empty-service and non-customer-facing platforms produce no groups. Mixed platforms keep all source service descriptions and towards wording. Each picker row now combines its direction and number in a 17pt semibold heading, with destination text immediately below in muted 15pt type. Blank directions and platform numbers retain explicit placeholders. Redundant cardinal direction and friendly-name copy is omitted from picker rows; published friendly names remain in platform details. Existing capability-based navigation, save identities, fixture mode and offline recovery remain covered by the existing screen and persistence tests.

## Automated evidence

| Command | Exit | Result |
| --- | --- | --- |
| `npm --prefix native run typecheck` | 0 | Strict native TypeScript check passed. |
| `npm --prefix native test` | 0 | 243 tests passed across 16 files, compared with the 211-test baseline. |
| `EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios` | 0 | iOS bundle exported successfully, 1120 modules. |
| `npm run verify` | 0 | Root typecheck, ESLint and 415 tests across 38 files passed. |
| `git diff --check` | 0 | No whitespace errors. |

Pure grouping tests use bundled Tottenham Court Road (Northern / Central / Elizabeth), Baker Street shared services and Kew Gardens (District + Mildmay). Artificial tests exercise overlapping sets without transitive merging, repeated services, mixed Rail details, source blanks, empty inputs, source-order preservation and permutation-invariant group order. Input mutation is checked explicitly.

Actual screen element-tree tests verify TCR heading order, complete row details and explicit direction, a single shared Kew heading, service labels in search/details and existing supported/browse-only navigation. Actual shared label and marker output is exercised through native host mocks in both themes: accessible header labels, wrapping configuration, unknown published labels, foreground text and visible borders for Northern black and Circle yellow. Saved/expanded board tests retain typography, alignment and header behavior at font scales 1, 1.35, 1.36 and 3.12, and assert that shared boards supply every published line identity.

## Simulator walkthrough

The controller also inspected the running iPhone 18 Pro simulator on 2026-11-10. Tottenham Court Road rendered Northern, Central, then Elizabeth headings with black, red and purple bordered markers and explicit directions on platform rows. Baker Street rendered Circle and Hammersmith & City together above their shared platforms, with separate yellow and pink markers. Station search and picker navigation worked through the native accessibility controls. The current app appearance was light; both-theme automated checks remain the evidence for dark-mode properties. A simulator screenshot was captured at `/private/tmp/nb14-baker-street.png`.

## Limits

At the end of Task 1, evidence comprised automated element-tree/export checks and a light-appearance simulator walkthrough, without a physical-device or full VoiceOver walkthrough. Wrapping is enabled without line truncation and accessibility roles/labels are asserted. Physical-device text fitting, full screen-reader focus order and dark-mode rendered contrast had not been observed at that point; the Task 2 section below records the subsequent dark-appearance simulator check. No live TfL API request was required. The export's `.invalid` URL deliberately validates build configuration only. Expo emitted non-fatal `NO_COLOR` / `FORCE_COLOR` environment warnings.


## Task 2 hierarchy refinement (2026-11-10)

Real Tottenham Court Road rows now use titles such as `Northbound Platform 3`, with one destination line beneath (or `Towards not published` for a blank source destination). Camden Town platform 1 renders `Northbound Platform 1` followed by `Towards Edgware`. All TfL services sharing a published destination yield one `Towards ...` line; different destinations retain each line name, and repeated line-ID/destination pairs appear once. Mixed National Rail details remain separately labelled because National Rail is not included in the TfL group heading. No catalogue values are rewritten.

The shared `Result` component has an optional title emphasis flag used by canonical and synthetic picker rows. Other callers retain regular 17pt titles. Emphasised picker rows expose a complete accessibility label containing title and destination, preserve the 64pt minimum row height and existing system font, and impose no text line limit or font scaling cap. Synthetic fixtures use the same combined title and explicitly show `Towards not published` because they contain no destination field.

Task 2 verification against the current source:

| Command | Exit | Result |
| --- | --- | --- |
| `npm --prefix native test -- --run tests/line-presentation.test.ts tests/line-labels.test.ts tests/offline-discovery.test.ts` | 0 | 156 tests passed across 3 files. |
| `npm --prefix native run typecheck` | 0 | Strict native TypeScript check passed. |
| `npm --prefix native test` | 0 | 250 tests passed across 16 files. |
| `EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios` | 0 | iOS bundle exported successfully, 1120 modules. |
| `npm run verify` | 0 | Root typecheck, ESLint and 415 tests across 38 files passed. |
| `git diff --check` | 0 | No whitespace errors. |

New failing tests preceded implementation: the helper/emphasis run failed 6 tests (30 passed), and the screen run failed 3 tests (117 passed) against old titles and repeated descriptions. Complete-label tests then failed twice before the accessible label was added. The passing suite covers published TCR/Camden headings, common and differing destinations, deduplication, missing values, mixed Rail details, no repeated picker copy, preserved details, canonical capability routes, synthetic navigation, and actual Result typography/accessibility in both themes through host mocks.

The controller verified the updated iPhone 18 Pro preview after implementation: Camden Town shows `Northbound Platform 1` / `Towards Edgware` and `Northbound Platform 3` / `Towards High Barnet`. A fresh simulator capture at `/private/tmp/nb14-latest-hierarchy.png` also confirms Tottenham Court Road's direction-first headings and destination subtext under Northern, Central and Elizabeth groups in dark appearance. This is simulator evidence; physical-device fitting and full VoiceOver focus remain unverified. Task 2 implementation work did not start a simulator or persistent development server. Expo's non-fatal colour-environment warnings remain unchanged.

## Task 3 concise departure and picker copy (2026-11-10)

The native board model now displays `Epping Underground Station` as `Epping` and `Hainault Underground Station` advertised via Newbury Park as `Hainault via Newbury Park`. It removes the case-insensitive station suffix at the station-name boundary, including before a destination's own via qualifier. Whitespace is normalized for display, while meaningful station-name words remain. Missing destinations still display `Unknown destination`. Actual advertised via routes and existing Bank / Charing Cross alias normalization remain; a route already present in the destination is displayed once. A missing branch produces no visible or accessible placeholder. Existing board joins filter empty fields, preserving complete row labels without extra commas.

Canonical and synthetic platform picker cards omit unpublished destination subtext. Published destinations, differing service labels, and published National Rail destinations remain. The existing `Result` hides an empty detail label and joins only non-empty accessibility fields, so cards without destinations have one text line and no trailing punctuation. Platform details retain `Towards not published`; catalogue/API values, coverage states, direction/number placeholders, identities, matching, countdowns, sorting and freshness behavior are unchanged. Tests explicitly check source snapshots and service arrays for mutation.

The final regression command was run against baseline production sources at `de5aa1ea4d53d8ba390f2e4c44dbb62062d1da0c` and exited 1 with **26 failed / 190 passed** in 5 files. The same tests against the implementation exited 0 with **216 passed** in 5 files. These exercise real board row output and accessibility in Amber/Modern, saved/expanded, and light/dark combinations through existing native host mocks; actual empty picker `Result` output in both themes; canonical and synthetic screen flow; retained platform details; case/whitespace boundaries; unknown destinations; via deduplication; and unchanged inputs.

| Command | Exit | Result |
| --- | --- | --- |
| `npm --prefix native test -- --run tests/departures.test.ts tests/line-presentation.test.ts tests/platform-board-layout.test.ts tests/line-labels.test.ts tests/offline-discovery.test.ts` | 0 | 216 tests passed across 5 files. |
| `npm --prefix native run typecheck` | 0 | Strict native TypeScript check passed. |
| `npm --prefix native test` | 0 | 274 tests passed across 16 files. |
| `EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios` | 0 | iOS bundle exported successfully, 1120 modules. |
| `npm run verify` | 0 | Root typecheck, ESLint and 415 tests across 38 files passed. |
| `git diff --check` | 0 | No whitespace errors. |

Full local stdout logs use `/private/tmp/nb14-concise-copy-` with the suffixes `red.log`, `targeted-green.log`, `native-typecheck.log`, `native-tests.log`, `ios-export.log`, `root-verify.log`, and `diff-check.log`. These temporary logs supplement the recorded commands/results above.

At 23:12 on 2026-11-10, the controller inspected the already-running iPhone 18 Pro through CUA Device Hub in dark appearance after Expo Fast Refresh loaded the edits. Tottenham Court Road's Elizabeth picker cards exposed `Eastbound Platform A` and `Westbound Platform B` without empty or punctuated destination text. The Central Platform 2 expanded Amber board visibly showed `HAINAULT VIA NEWBURY PARK` and `EPPING`; the corresponding accessibility text was equally concise, and countdowns remained present. The implementation worker started no server and operated no simulator. This evidence does not establish physical-device fitting or a full VoiceOver walkthrough. The `.invalid` export URL verifies bundling only; Expo's non-fatal `NO_COLOR` / `FORCE_COLOR` warnings remain unchanged.

## Final review destination attribution fix (2026-11-10)

The picker checks the complete TfL service set before omitting line labels from a shared destination. If any TfL destination is blank or whitespace-only, published destinations retain their line names and unpublished rows stay hidden. For example, Ealing Common platform 2 now displays `Piccadilly · Towards Oakwood` because District's destination is unknown. National Rail destinations remain separately labelled; missing Rail destinations do not prevent a valid common TfL destination. No source services or screen/navigation code changed.

Before the helper fix, `npm --prefix native test -- --run tests/line-presentation.test.ts` reproduced **5 failed / 31 passed**: four real shared platforms (Ealing Common 2, Barking 6, Paddington 2, South Kensington 2) and the corrected synthetic mixed-known/unknown expectation all lacked the required line label. After the fix, `npm --prefix native test -- --run tests/line-presentation.test.ts tests/offline-discovery.test.ts tests/line-labels.test.ts` exited 0 with **163 passed across 3 files**. `npm --prefix native run typecheck` and `git diff --check` also exited 0. Logs are `/private/tmp/nb14-final-fix-red.log`, `/private/tmp/nb14-final-fix-targeted-green.log` and `/private/tmp/nb14-final-fix-typecheck.log`. Full current-head suites/CI and final review remain controller responsibilities; this fix wave ran no root suite, simulator or server.


Final scoped re-review at `2ce5f25` returned **Specification PASS / Code quality PASS**, clearing the shared-platform attribution finding with no new actionable findings. The controller reran `npm --prefix native test` against that source at 23:24: all **278 tests across 16 files passed** (exit 0; `/private/tmp/nb14-final-native-tests.log`). Native typecheck and `git diff --check` also exited 0. Root verification and iOS export remain the successful Task 3 evidence above; the final code change is confined to the destination presentation helper and its tests. Latest-head CI is verified separately on the PR.

At 23:25 the controller inspected the current iPhone 18 Pro preview in Device Hub: Central departures expose `Epping` and `Hainault, via Newbury Park` with expected times; the Tottenham Court Road picker exposes Elizabeth `Eastbound Platform A` and `Westbound Platform B` without destination placeholders. The current preview therefore includes the requested concise copy. No server or simulator was started for this final check.
