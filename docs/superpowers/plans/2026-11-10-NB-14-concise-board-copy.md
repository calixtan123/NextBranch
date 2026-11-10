# NB-14 Concise Native Departure and Picker Copy

**Goal:** Make the existing native departure board and platform picker easier to scan, exactly as requested on 2026-11-10.
**Spec:** The user's follow-up: destination names such as Epping must omit Underground Station and Branch unavailable; retain meaningful via routes such as Newbury Park. Picker cards omit Towards not published.
**Architecture:** Extend the existing native board model and picker destination helper. Raw API/catalogue data and web presentation remain intact. Existing Result already hides an empty detail string.

## Global Constraints

- Shorten only display copy. Preserve physical platform identity, live matching, countdowns, freshness/error states, line grouping, published destinations and meaningful via routes.
- Strip the redundant Underground Station suffix case-insensitively at the station-name boundary, including before a via qualifier, without removing meaningful station-name words. Keep unknown destination fallback when no usable destination exists.
- Omit Branch unavailable in both visible native board rows and row accessibility labels. Retain actual advertised via routes and avoid repeating a via clause already in destination text. Preserve existing Bank/Charing Cross normalization.
- Hide missing destination subtext only in platform picker cards, including synthetic rows. Published destinations still appear and differing destinations keep their service labels. Do not render empty lines, dangling separators or extra accessibility punctuation.
- Catalogue, API, platform details, coverage/error messages and non-picker unknown fields retain their information.
- Use existing TypeScript/Vitest tools, no new dependencies, no unrelated refactor, preserve other agents' edits.

### Task 1: Simplify native destination and picker copy

**Ownership:** native/src/board-model.ts, native/src/line-presentation.ts, native/src/SearchScreens.tsx, native/src/theme.tsx only if needed; relevant native/tests files; append a Task 3 section in docs/design/NB-14-verification.md. No other source files.

1. Trace existing boardRows and picker Result flow; add behavioural regression tests first and demonstrate failures.
2. Extend existing helpers to satisfy every Global Constraint with the smallest coherent implementation. The shared board model owns display normalization for both saved and expanded boards.
3. Test Epping Underground Station without via -> Epping; Hainault Underground Station with via Newbury Park -> Hainault via Newbury Park in rendered text; a destination containing its own via clause; existing Bank/Charing Cross; whitespace, mixed case, blank destination; no mutation. Verify actual board visible/accessibility content and picker cards without placeholder detail in both themes as existing mocks permit. Preserve details-screen placeholder information.
4. Run npm --prefix native run typecheck; npm --prefix native test; EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios; npm run verify; git diff --check. Record commands/results and any material limitations in report and verification doc.
5. Self-review and report. Do not push, open PRs, start servers or operate simulator. Controller owns publication and manual verification.
