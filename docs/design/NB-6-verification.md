# NB-6 offline station discovery

The native Search screen uses the shared validated TfL inventory through `native/src/discovery.ts`. The passenger catalogue contains 460 stations, 1,235 physical platforms and 1,528 published platform-service relationships. Shared platforms appear once. National Rail-only and non-customer-facing platforms are filtered by the shared catalogue module.

Search uses the shared canonical-name and reviewed-alias normalization and deterministic ordering. An empty query shows the two recent stations. Recent canonical IDs are stored through the existing preference owner, and names are resolved from the current bundled catalogue after restart. Punctuation-only queries behave as empty queries. No-match and unavailable-catalogue messages remain distinct.

## Platform inspection

The picker groups Southbound, Northbound, Eastbound, Westbound and unpublished directions. Each physical row retains its published friendly description and every service's line and towards wording. Blank numbers display “Platform number not published”, and unpublished directions and towards fields are labelled explicitly.

The existing reviewed Northern tuples continue to open Departures. Other platforms open Platform details using canonical station and physical-platform IDs. Those details explain that live departures and saving are unavailable in this version. Canonical saved-selection migration and expansion of live support belong to subsequent tickets.

A guarded bundled-module load catches validation or module-initialization failures so Home and existing saved-platform recovery can still start. Search then displays the unavailable-catalogue recovery message. The catalogue needs no network request. A missing source file at build time still requires repairing the app build.

## Automated verification

Run from the repository root.

```sh
npm --prefix native test -- tests/offline-discovery.test.ts
npm --prefix native test
npm --prefix native run typecheck
npm --prefix native run export:ios
npm run verify
```

On 10 November 2026 the focused suite initially passed eight tests, the complete native suite initially passed 67 tests, native type checking passed, iOS export produced a 3.1 MB Hermes bundle with 1,109 modules, and root verification passed type checking, lint and 291 tests. All commands exited with code 0. The native screen tests execute actual Search, Picker and Platform details component functions, inspect their element trees and invoke real navigation callbacks with native view and hook boundaries mocked. They also exercise durable preference restoration.

The compatibility regression test disables `Array.prototype.toSorted`, then creates and searches the shared full catalogue. Sorting fresh result arrays with `sort` preserves the existing source order on native runtimes lacking that newer method. Metro watches the shared library and inventory directories and has a native Zod fallback. Native type checking and iOS export verify the shared schemas against the installed runtime dependencies.

## Simulator walkthrough

These steps describe the expected real-app walkthrough for the controller. The implementation agent completed automated screen tests and bundle export, and did not execute simulator interactions or capture screenshots.

Use the production discovery path with `EXPO_PUBLIC_NEXTBRANCH_FIXTURE` unset. Start a temporary Metro instance on an available port for the existing dev client. Stop that instance when finished.

1. Open Home and Search with no recent history. Confirm the recent-search guidance, then enter an unmatched station name and confirm the no-match message. Clear the field.
2. Search `kEW-Gardens`. Confirm the Kew Gardens result lists District and Mildmay. Open it and confirm exactly two platforms, Eastbound 1 and Westbound 2. Platform 1 retains District towards Earl's Court and Mildmay towards Stratford. Open its details and confirm browse-only wording with no Save action.
3. Search East Croydon. Confirm exactly two Tram platforms with unpublished numbers. Inspect Eastbound or Westbound details and confirm the unpublished-towards wording. National Rail-only numbered platforms are absent.
4. Search White City. Inspect its unknown-direction group containing platforms 2 and 3. Open either and confirm “Direction not published”.
5. Search Abbey Road. Confirm DLR and its published Northbound and Southbound platform descriptions. Inspect a platform, return Home and restart the app. Open Search and confirm recent canonical station IDs resolve to readable names.
6. Search `Kings Cross` to verify the reviewed Northern alias. Search Camden Town, select a reviewed platform and confirm the existing Departures and Save flow. Repeat the existing synthetic fixture walkthrough separately with its fixture environment enabled, including the A/B platform labels.
7. The missing/invalid-catalogue state is tested through the guarded loader injection. A simulator build containing a deliberately broken bundled snapshot can additionally exercise that recovery message, with the source restored afterward.

Simulator rendering, Dynamic Type and VoiceOver remain controller verification work. The existing theme, list components and minimum touch targets are reused.

## Controller observations on 10 November 2026

The production discovery path ran in the installed development client on iPhone 18 Pro, iOS 27.2, through this worktree's temporary Metro server on localhost port 8097. The fixture environment was unset. Native accessibility trees and a rendered Search screenshot were inspected through Device Hub.

- Empty history displayed the two-recent-search guidance.
- `kEW-Gardens` returned Kew Gardens with District and Mildmay. Selection showed exactly two physical platforms, Eastbound 1 and Westbound 2. Platform 1 details retained District towards Earl's Court and Mildmay towards Stratford, with browse-only capability wording.
- East Croydon returned Tram and exactly two physical platforms, Eastbound and Westbound. Both displayed unpublished platform numbers and towards fields. Numbered National Rail-only platforms were absent. Eastbound details retained the same source blanks.
- White City displayed Eastbound 4, Westbound 1, and platforms 2 and 3 under the unpublished-direction heading. Platform 2 details explicitly displayed “Direction not published”.
- `ZZZNoStationZZZ` displayed the no-match recovery message. Clearing search showed readable White City and East Croydon recent rows in selection order.

The simulator already had VoiceOver and Reduce Motion enabled. Controls, direction headings and complete multiline service descriptions appeared in its accessibility tree. A spoken VoiceOver audit, maximum Dynamic Type/device matrix, restart persistence walkthrough, additional DLR and Northern/fixture simulator walkthroughs were not performed in this check. Automated native screen and preference tests cover DLR, reviewed Northern and fixture navigation, restart persistence, missing-catalogue recovery, no-network loading and the legacy/canonical recent-history migration.

Device Hub intermittently returned stale element IDs, lost its accessibility window, or timed out after completing an action. Reacquiring the app and reading the resulting screen verified the observations above. These automation failures were not counted as successful steps without a resulting screen observation. This walkthrough did not disconnect the Simulator network. Offline behavior is verified by the bundled production path and the automated no-network boundary test.

After the recent-history correction, the focused suite passed 11 tests and the complete native suite passed 70 tests across 12 files, with native TypeScript and diff checks passing. The correction canonicalizes legacy station IDs before deduplication and the two-station limit, preserving a second distinct station and recoverable identities when the catalogue is unavailable.
