# NB-15 line label and Elizabeth destination follow-up

## Goal

Keep Hammersmith & City on one line in the board header and remove Rail Station from Elizabeth departure destinations. Continue existing PR #16 into feat/NB-15-board-card-hierarchy.

## Global Constraints

- Existing NB-15 association and explicit user permission to implement during Jira outages apply. Connector currently returns Unknown tool. Report lifecycle updates as blocked until confirmed.
- Preserve full line names, colours, scalable system typography, platform/direction priority, raw predictions, matching, countdowns and accessible identities.
- Work in the existing isolated feature worktree. Preserve others' changes. Do not spawn agents, commit or push from implementation agents.
- Only native presentation and directly relevant tests are in scope. Use existing Vitest tests and shared Metro/API services. No dependency or server changes.

### Task 1: Keep the complete Hammersmith & City header label together

Own native/src/PlatformBoard.tsx, native/src/LineLabels.tsx if necessary, and corresponding tests. Trace header constraints and existing text-scale fallback first. Fix the responsible board layout so the full label fits on one line at ordinary iPhone widths, with its colour swatch. Preserve primary platform/direction hierarchy. Narrow or accessibility layouts must show complete readable labels by stacking when necessary, with font scaling enabled and no truncation or automatic text shrinking. Do not force every shared line-label consumer to truncate. Add a failing regression test first. Run native targeted tests, native typecheck and diff-check. Report commands, red/green evidence, changed files and limitations.

### Task 2: Shorten Elizabeth line destination names

Own native/src/board-model.ts and directly relevant native/tests files. Extend existing display-only station suffix cleanup so Elizabeth destinations such as Paddington Rail Station become Paddington, including mixed case/extra spaces and embedded via clauses. Preserve via wording, source data, unknown fallback and real names containing Rail Station internally. Use the same concise identity for visible and accessible board rows. Add failing regression coverage first, including normal PlatformBoard entry points, then run native tests, typecheck, iOS export and diff-check. Report commands, red/green evidence, changed files and limitations.
