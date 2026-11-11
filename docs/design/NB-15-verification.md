# NB-15 platform card hierarchy verification

## Result

Direction and platform number form the primary 19pt bold system-font heading. Station identity is secondary. Line markers use the same system font. Routine friendly-name, service-success and unpublished-destination footer copy is omitted. Actionable coverage and freshness warnings remain. The live departure renderer is unchanged.

## Evidence

Application commit: 3a78080. Baseline: e668e9c on feat/NB-14-line-platform-groups.

- `npm --prefix native run typecheck`: passed, exit 0.
- `npm --prefix native test`: passed, 16 files and 285 tests, exit 0.
- `npm --prefix native run export:ios`: passed, 1120 modules and 3.2 MB iOS bundle, exit 0.
- Independent task review: requirements pass, quality approved, no findings.
- Fresh whole-branch review: requirements pass, quality pass, no findings.
- Running iPhone 18 Pro / iOS 27.2: inspected saved Home cards for Tottenham Court Road Elizabeth/Northern and Baker Street Circle/Hammersmith & City. Combined platform heading is prominent, station is secondary, colour markers remain, routine footer is gone. Accessibility summaries contain the concise identity and departures.

## Limits

Element-level tests cover both themes, Amber/Modern, expanded cards and larger text. Rendered verification covered dark saved Home cards only: Device Hub action controls returned invalid-element/no-window errors, preventing expanded-card and app-theme interaction. Changing simulator appearance did not change the app's explicitly selected dark theme. Large-text wrapping and VoiceOver traversal were not manually verified. Existing shared Metro (8085) and API (3005) processes were reused and retained for user inspection.

The Jira connector returned Unknown tool when fetching NB-15; no successful completion comment or Done transition is claimed. Leave the issue open until Jira is available.

## Decisions

- Reused the existing isolated worktree on a fresh NB-15 branch based on NB-14 so the simulator continues to load the same source path. Returning to older work requires a branch switch.
- Omitted missing-destination placeholders while retaining explicit missing direction/number and material service warnings, following the latest request. Full source data remains intact.
- Used one bounded implementation agent plus independent task and final reviews, as requested by ticket-agentic-development. No nested delegation.

## Dot-matrix punctuation and line-label follow-up

Implemented on feat/NB-15-matrix-line-suffix, based on 832ed4d and targeting feat/NB-15-board-card-hierarchy.

- Added 5×7 glyphs for parentheses, ampersands, straight/curly apostrophes, slash, comma, plus, question/exclamation marks, brackets and en/em dashes. Glyph-table membership controls eligibility. Unsupported characters and large accessibility text retain native text rendering.
- Departure destination identity uses Station (Line) for Circle, Hammersmith & City and multiple distinct TfL platform lines. Advertised via wording follows the line suffix. National Rail and duplicate memberships do not trigger a shared-line suffix. Feed-supplied equivalent suffixes such as Edgware Road (Circle Line) become Edgware Road (Circle).
- The same formatter supplies visible rows and accessible descriptions. Unique legacy platform number/direction matches reuse catalogue service metadata.
- Controller ran npm run verify successfully, including typecheck, ESLint and 415 tests across 38 files. Existing test diagnostic stdout was emitted.
- Inspected live Home on iPhone 18 Pro / iOS 27.2. Barking (Hammersmith & City) and Edgware Road (Circle) render in Amber matrix with complete parentheses and ampersands. The latter uncovered a duplicate feed suffix, which was corrected with regression coverage. Ordinary Northern destinations retain their concise names and via wording. Screenshot recorded at /tmp/nb15-matrix-final-home.png. Existing shared Metro 8085 and API 3005 were reused.
- Manual follow-up inspection covers dark Home in Amber. Modern, expanded, larger-text and accessibility string variants are covered by automated component tests. VoiceOver traversal has not been manually verified.
- Jira access recovered. NB-15 was fetched and scope recorded in comment 10822. The follow-up native test run passed all 314 tests across 16 files, native typecheck passed, and the final iOS export passed. Independent task and fresh whole-branch reviews both passed requirements and code quality with no blocking findings. GitHub PR and latest-head CI are recorded in Jira completion evidence.
