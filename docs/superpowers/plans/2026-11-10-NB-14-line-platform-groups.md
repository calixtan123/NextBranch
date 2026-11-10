# NB-14 Line Colours and Platform Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Make native line identities accurate and station platforms scannable by served lines.
**Architecture:** Native pure presentation helper derives line groups from validated physical-platform services. A reusable marker/label view consumes the palette at existing UI boundaries.
**Tech Stack:** TypeScript, React Native / Expo, Vitest.
**Spec:** docs/superpowers/specs/2026-11-10-NB-14-line-platform-groups.md

## Global Constraints

- Use the exact palette in the spec; service line_id owns membership.
- Every eligible physical platform appears once under its exact TfL line set; National Rail-only platforms stay excluded and mixed-platform details remain complete.
- At Tottenham Court Road present Northern, Central, Elizabeth in that order.
- Preserve offline search, published directions/descriptions, capability, navigation, save identity and synthetic fixtures.
- Use readable theme text with individual bordered line-colour swatches; shared headings wrap.
- No new dependencies or unrelated refactoring. Tests use existing Vitest framework because this is TypeScript/React Native.

## Review Focus

- Overlapping shared line sets must not merge transitively or duplicate platforms.
- Mixed National Rail services must not become TfL heading membership.
- Blank direction/number and unsupported feed platforms retain inspectable details.
- Black Northern and yellow Circle remain visible in light and dark themes.
- Existing fixture and saved-board line labels must survive component changes.

### Task 1: Apply line identity colours, then group native physical-platform discovery

**Files:**
- Create native/src/line-presentation.ts (pure palette, deduped ordered line labels and platform groups).
- Create native/src/LineLabels.tsx (small shared native line label view).
- Modify native/src/SearchScreens.tsx (search markers, exact-service-set picker groups, explicit row direction, details markers).
- Modify native/src/PlatformBoard.tsx and native/src/theme.tsx (replace Northern-only marker with data-driven marker(s)).
- Add native/tests/line-presentation.test.ts and extend existing native screen tests to cover rendered groups/navigation.
- Update docs/design/NB-14-verification.md with concrete verification and material limits.

**Interfaces:**
- Consumes CataloguePlatform / CatalogueService and schema line registry; existing catalogue.selection and navigation.
- Produces lineColour(lineId: string): string, platformLineGroups(platforms: readonly CataloguePlatform[]): group[] and a shared labels component (exact group shape chosen in helper and consumed consistently).

- [ ] First add palette tests for all pinned values and unknown fallback; demonstrate targeted failure; implement central palette and marker/label view. Apply to station search and existing boards without changing arrival logic.
- [ ] Add grouping tests using the real bundled Tottenham Court Road data (Northern / Central / Elizabeth), Baker Street or Hammersmith shared platforms and Kew Gardens (District + Mildmay), plus overlapping artificial line sets, repeat services, mixed National Rail, empty input, blank number/direction and permutation determinism. Assert input is not mutated and each eligible platform appears once.
- [ ] Demonstrate targeted test failure; implement exact-set grouping using line IDs and deterministic line order. Avoid empty or National Rail-only groups.
- [ ] Integrate groups into PickerScreen: accessible heading with every group's served line and colour; each row retains explicit cardinal direction, friendly_name and full services/towards text. Preserve supported-to-board and unsupported-to-details navigation. Keep fixture mode functional.
- [ ] Extend actual element-tree screen tests for TCR heading order, shared group once, complete rows and navigation; test actual marker/label output in both themes including wrapping and unknown fallback as existing mocked native boundaries permit.
- [ ] Run `npm --prefix native run typecheck`, `npm --prefix native test`, `EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios`, `npm run verify` and `git diff --check`. Record commands/exit codes and TDD red/green evidence in the report. Do not start persistent servers or modify unrelated files.
- [ ] Self-review the complete diff; write report to the provided task report path. Do not push or create PRs. Controller owns git commits and publication if permissions prevent local commits.
