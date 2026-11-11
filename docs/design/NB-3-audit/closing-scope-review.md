# NB-3 closing scope review

10 November 2026. Read-only consolidation following the controller's latest runtime report. No new whole-branch review, source edits, UI actions, test runs or delegated work. The reviewer owns no UI surface or background process. Existing scoped implementation/design approvals stand.

## Evidence that is now closed

The current repository verification document is stale. Carry these accepted outcomes forward rather than repeating them:

- Representative small/large maximum-type essential destination, advertised branch, countdown and lower-action readability: independently inspected in `acceptance-final-addendum.md`, with controller-observed scrolling. The small navigation title's midword wrap remains a recorded layout limitation, not a newly established functional blocker.
- Management: successful one-slot replacement is independently supported by the selection/confirmation/result images. Controller's recovered pre-compaction record additionally reports VoiceOver-enabled removal/Undo, timed Undo expiry, and replacement Cancel preserving all three cards/order. These are controller observations, not conclusions drawn from `undo-expiry-empty-home.png`, which shows Search and remains unsuitable expiry evidence.
- Reduce Motion: controller reports small-iPhone navigation/Reduce Motion coverage and a new iPhone 18 Pro Max run with Reduce Motion enabled followed by appearance/navigation/refresh flows.
- Appearance: controller observed global Amber → Modern → Custom, then Home retaining Colindale Modern and Camden B/A Amber; Colindale detail was opened. Retention is closed. Explicit detail style agreement should be stated in the final walkthrough record if observed, rather than inferred merely from opening the screen.
- Accessibility structure: controller observed full destination/branch/countdown/London-time labels, no per-dot nodes, and checked/unchecked appearance options with VoiceOver enabled. Accessible management interaction is reported above. These establish inspected semantics/interaction, not audible speech or announcement timing.

Existing successful search/keyboard recovery, drag/non-drag reorder, process restart and visual comparisons remain accepted as recorded in prior reports.

## Verification evidence read directly

No checks were rerun. `/tmp/nb3-current-native-verify.log` contains **33 passing tests in seven files**, native `tsc --noEmit`, then a completed iOS export. `/private/tmp/nb3-native-audit/resume-root-verify.log` records the root verify pipeline and **260 passing tests in 34 files**. `/tmp/nb3-final-current-export.log` separately ends with `Exported: dist` for the current Hermes bundle. The controller reports these commands exited successfully. These supersede the old 25-test count and the previous addendum's caution that a full 33-test run had not yet been supplied.

## Remaining gates only

1. **Auditory accessibility acceptance.** Available tools expose accessibility structure but cannot hear speech. Meaningful labels and selected state are evidenced; actual spoken output, exactly one refresh-completion announcement and absence of countdown chatter remain unobserved. Record this concrete tooling limitation. Do not claim the auditory criterion passed from the accessibility tree. If the criterion remains mandatory, it needs an observable speech check or an explicit user acceptance-scope decision.
2. **Complete the four walkthrough record.** Controller is completing this. Consolidate already observed steps; remaining previously absent UI outcomes were empty-launch through save, controlled independent station failure, and expiry/failed-refresh through retry/offline/background-resume. State exactly which were observed, tested only or unavailable. Include effective Colindale detail style agreement if actually observed. Do not restart already accepted sequences to fill an old checklist.
3. **Record environment and catalogue limits.** Physical-iPhone and live-API validation need an explicit passed/unavailable status with the actual obstruction. Fixture checks do not establish live behavior. Only six reviewed Colindale/Camden production tuples exist; High Barnet must be reported as recoverable catalogue limitation, not successful reviewed-platform selection. These limitations are not presumed code defects.
4. **Reconcile the durable verification and Jira record.** Update `docs/design/NB-3-verification.md` to 33 native tests and the accepted outcomes above; retain unresolved auditory/walkthrough limitations accurately. Preserve or attach relevant local artifacts. The controller owns the Jira implementation/verification comment and successful Done transition under the workspace lifecycle. Do not represent unverified mandatory checks as passed simply to close the issue.

No new actionable source defect is established by this consolidation. Remaining work concerns the precise runtime acceptance record and its unresolved auditory/environment boundaries, not another review of unchanged implementation.
