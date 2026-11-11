# NB-15 dot-matrix punctuation and destination line suffix

## Goal

Support common punctuation in Amber dot-matrix departures and display destination line identity as `Station (Line)` on Circle, Hammersmith & City, and platforms serving multiple distinct TfL lines.

## Global Constraints

- Continue the existing NB-15 follow-up from commit 832ed4d, targeting parent branch feat/NB-15-board-card-hierarchy. Jira NB-15 was fetched successfully after reconnecting. Follow-up scope is recorded in comment 10822.
- Station means the departure destination in this change. Retain advertised via wording after the parenthesised line, including destinations with embedded via clauses. Preserve raw source data and platform matching.
- Resolve each departure's actual line identity. Show Circle and Hammersmith & City even on a single-line platform. Count distinct TfL line IDs for shared-platform eligibility, excluding National Rail and duplicate services. Omit a label when the actual line cannot be established. Reuse published names and the existing schema names for legacy selections where possible.
- Add 5x7 glyphs for parentheses, ampersand, straight and curly apostrophes, slash, comma, plus, question mark, exclamation mark, square brackets, and en/em dashes. Derive matrix eligibility from the glyph table with an own-property check. Preserve readable text fallback for unsupported characters, Modern style, and accessibility text sizes.
- Use identical formatted departure identity in visible rows, expanded-row accessibility, and collapsed-card accessibility. Preserve countdowns, freshness, warnings, card headings, colour markers, and wrapping.
- No backend, catalogue, preference, dependency, or unrelated visual changes. Do not start or terminate shared servers.

### Task 1: Extend matrix punctuation and format departure line suffixes

Own native/src/glyphs.ts, native/src/board-model.ts, native/src/PlatformBoard.tsx, and directly relevant native/tests files. You are not alone in the codebase. Preserve others' changes. Do not spawn agents, commit, or push.

1. Trace glyph eligibility, matrix rendering and sizing, boardRows projection, TrainRow line labels, and collapsed accessibility summaries before editing.
2. Add focused failing tests proving punctuation uses matrix rendering, every glyph is seven binary rows of five columns, unsupported Unicode and large text use readable fallback, and source data stays intact.
3. Add focused failing tests for `Barking (Hammersmith & City)`, `Hammersmith (Circle)`, shared `Ealing Broadway (District)`, ordinary Northern rows without a suffix, duplicate memberships, TfL plus National Rail, missing/unknown line identity, and both separate/embedded via clauses. Check the normal PlatformBoard entry point for both styles, Home/detail and accessible summaries. Follow the existing native Vitest setup.
4. Extend the responsible glyph table and existing board presentation layer. Prefer one shared formatter used by visible and accessible row summaries. Use destination, parenthesised actual line, then advertised via wording. Avoid duplicate line or via text and avoid inventing an ambiguous line.
5. Run `npm --prefix native test`, `npm --prefix native run typecheck`, `npm --prefix native run export:ios`, and `git diff --check`. Record initial failing tests and final commands/results in the report, plus changed files and material limitations.

Controller owns independent task review, fresh final review, simulator verification, Git publication, latest-head CI and Jira lifecycle updates.
