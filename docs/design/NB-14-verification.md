# NB-14 native TfL colour and platform-group verification

Verified on 2026-11-10 in the existing isolated `feat/NB-14-line-platform-groups` branch, based on `377cb6e`.

## Implemented behavior

One line-ID palette supplies bordered markers for station search, picker headings, platform details and saved/expanded boards. All 21 pinned TfL identities are tested verbatim, including the six current Overground names. Unknown and National Rail service markers use neutral `#61686B`, while their published labels remain visible. Label text uses the theme foreground rather than the service colour.

The picker derives groups from exact non-National-Rail service-ID sets. Northern comes first, other Underground lines follow alphabetically, Elizabeth follows, and remaining lines are deterministic by ID. Source physical-platform order stays intact within each group. National Rail-only, empty-service and non-customer-facing platforms produce no groups. Mixed platforms keep all source service descriptions and towards wording. Each row states its own direction, including a clear placeholder for blank directions. Existing capability-based navigation, save identities, fixture mode and offline recovery remain covered by the existing screen and persistence tests.

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

These are automated element-tree/export checks and a light-appearance simulator walkthrough, not a physical-device or full VoiceOver walkthrough. Wrapping is enabled without line truncation and accessibility roles/labels are asserted; physical-device text fitting, full screen-reader focus order and dark-mode rendered contrast have not been observed. No live TfL API request was required. The export's `.invalid` URL deliberately validates build configuration only. Expo emitted non-fatal `NO_COLOR` / `FORCE_COLOR` environment warnings.
