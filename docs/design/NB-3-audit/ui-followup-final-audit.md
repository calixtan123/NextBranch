# NB-3 final whole-branch and native visual audit

Reviewed 10 November 2026 against main base `0dd90324c186578ee8b05243fcead93009d32d4d`, including working changes and untracked follow-up tests. Read-only source review; no source edits, commits, pushes, test-suite reruns, or additional agents.

## Verdicts

- **Spec: PASS for source implementation review; acceptance remains incomplete.** No blocking implementation finding. The follow-up implements the requested responder arbitration, visible drag movement, measured targeting, cancellation, Home spacing and system control treatment without changing the persistence or departure-data contracts. Actual updated finger drag and the existing manual acceptance gates remain unverified. Runtime identity is confirmed by the controller’s Metro process/cwd and served-bundle evidence; exact rendered Home spacing remains unmeasured.
- **Code quality: PASS.** No actionable correctness or maintainability defect established in the reviewed whole-branch source and follow-up integration.
- **Blocking source findings: 0.** This is permission to continue the existing draft-PR workflow after its normal latest-head checks, not a recommendation to mark NB-3 Done or remove the draft status.

## Inputs and review scope

Read the follow-up requirements in `/private/tmp/nb3-ui-refinement-plan.md`, ticket `docs/design/NB-3-spec.md`, implementation report `/private/tmp/nb3-ui-refinement-report.md`, task review `/private/tmp/nb3-ui-followup-review.md`, whole-branch diff inventory `/private/tmp/nb3-followup-final-review.diff`, and committed verification/acceptance record `docs/design/NB-3-verification.md`.

Independently inspected the final native screens, shared theme and Surface, root navigation/runtime, preference owner, station request owner, API decoder/transport, catalogue, fixtures, board projection and SVG/native renderer. Reviewed the new responder/interface tests and representative expiry, request, persistence and layout coverage. Inspected the root/shared-code and CI changes, including Hermes-compatible station sorting, the URL-to-file alias correction and separate native CI job. Reviewed the six production catalogue tuples against the retained platform evidence. Did not independently re-download TfL provenance or inspect the binary XLSX artifact.

## Spec and integration assessment

The preference owner retains canonical tuple identity, a three-card limit, serialized versioned snapshots, duplicate detection, slot-specific replacement, per-card style preservation and held Undo replacement intent. The follow-up calls the same `preferences.move` transaction only on release. Cancelled and stale releases do not persist. An active handle unmount clears its gesture state, and accessible moves use the current preference order.

The handle claims a starting touch, prevents responder termination and disables its enclosing native ScrollView during the active gesture. The dragged row follows vertical movement with stacking and a shadow. Targets are selected from measured row centers, so multi-position movement does not assume fixed heights. The movement-history flag prevents a horizontal drag or a drag returning to its origin from opening the tap alert. Tests exercise the actual callbacks and real preference owner, including cancellation, cleanup, one final storage write and preserved style.

The theme now supplies system typography and blue actions, inset search treatment and separator-based menu rows. Board labels explicitly override the shared font/weight so the Amber/Modern rendering retains its established typography. `PlatformBoard` uses 18-point bottom spacing on Home and 10 on detail. Both palettes, native scrolling, keyboard insets, 44-point controls and non-drag reorder remain present. No dependency was added for the follow-up. Retry/Review selection use the updated shared action treatment, while train rows retain their prior rendering.

Broad branch invariants remain coherent: navigation ownership deduplicates station IDs; fresh expanded boards reuse matching memory; removed ownership cancels flights and late results are guarded by flight identity. API data is validated before projection. Exact platform/direction filtering and expiry precede sorting/limiting. Shared 429 timing, the manual cooldown, background suspension and offline recovery remain in the station owner. Fixtures stay behind the development gate, use separate preference storage, disclose synthetic labels and use a frozen observation clock. Live selection remains restricted to six reviewed tuples with recoverable unknown-catalogue UI.

## Actionable code findings

None established. There are no severity/file/line findings to report. The rendered-spacing measurement limitation below is an evidence limitation, not a demonstrated source defect.

## Independent native visual observations

Used only CUA against Device Hub, iPhone 18 Pro Max / iOS 27.2, portrait, Text Size inspector value 2 and VoiceOver off. The first screenshot request timed out and reset the CUA kernel; subsequent combined state/screenshot calls worked.

- **Settings, dark:** system-style heading/body text, blue Back, two inset rounded menu rows, subdued detail text and visible separators. Both rows and their disclosure arrows fit without clipping.
- **Manage, dark:** three separate rows, visible grip at left, station/platform text and disclosure in the middle, red removal icon at right, and a blue Done control. Instructional copy fit on one line at this size. No row/control overlap was observed.
- **Accessible reorder:** independently invoked the exposed `Move down` secondary action on Colindale. The accessibility tree placed it after Camden A and changed its available actions to include Move up. Invoked Move up and observed Colindale restored first, with Camden A/B retaining their relative order at that point. This was an accessibility API action, not audible VoiceOver or finger dragging.
- **Home, dark:** three complete Modern boards rendered. Destination/Bank/Charing Cross wording, countdowns, station/platform labels and freshness footers were readable. Surrounding Search and Manage controls were blue, saved count was visible, and fixture disclosure remained present. The displayed gap between board shells appeared around 10 screenshot pixels in the scaled CUA image. Screenshot pixels are not calibrated logical iOS points, so this observation neither verifies nor contradicts the source’s 18-point spacing.
- **Search, dark and light:** inset search field, two recent station rows, clear section hierarchy and blue navigation actions. Light mode correctly changed to pale grouped background, white rows, dark labels and blue actions. No visible clipping in these states. Restored the simulator's original Dark appearance afterward.
- **Reload boundary:** opened the app's Expo tools menu through its gear control, observed the connected server `http://127.0.0.1:8081`, invoked Reload, observed a downloading state and then a fully rendered Home. The controller subsequently confirmed that port 8081 is served by PID 54328 running this worktree’s `native/node_modules/.bin/expo start --dev-client --localhost --port 8081`, with `lsof` reporting cwd `/Users/calixtan/.codex/worktrees/nb-3-native-ui/tfl-tracker/native`. The fetched current iOS development bundle `/private/tmp/nb3-current-metro-bundle.js` contains `marginBottom: expanded ? 10 : 18` at line 121872. Combined with the observed Reload, this supports current-worktree runtime identity. Exact rendered logical-point spacing was not measured.

Screenshot provenance: this reviewer inspected screenshots inline in CUA tool results and did not save separate image files. There is therefore no independent current screenshot filesystem path to attach to this audit; existing `/private/tmp/nb3-native-audit/` images are not represented as captures from this follow-up review.

Two navigation attempts returned a CUA external-state-change warning. A later full accessibility snapshot showed Camden B/A order differing from the earlier restored A/B order without a corresponding action by this reviewer. I did not overwrite that external change. Reload retained the later Colindale/B/A state. Final UI was Home in Dark mode. The CUA phase was closed with exactly one completion summary.

## Verification evidence and limits

The controller reports fresh native typecheck and 38 tests in nine files, root verification with 260 tests, iOS export and diff checking on the reviewed working tree. The implementer independently reported the same native suite/typecheck/export and red-to-green checks. Read the controller logs at `/private/tmp/nb3-followup-prepublish-verify.log` and `/private/tmp/nb3-followup-prepublish-export.log`; their visible tails confirm 260 passing root tests and successful Hermes bundle export. No suites were rerun by this reviewer.

The existing green remote CI belongs to prior head `cb88c35`. Fresh CI must pass after the follow-up is committed and published. This review does not substitute prior-head CI for final-head CI.

## Declined to judge / remaining acceptance gates

- Updated finger drag arbitration, motion fidelity and cancellation on a physical touch gesture. The controller previously encountered CUA coordinate error `-10005 noWindowsAvailable`; this reviewer did not repeat failed coordinate drag operations. Passing callback tests and accessible moves do not prove this gesture.
- Exact rendered 18-point Home gap. Runtime identity is now supported by process/cwd and current served-bundle evidence, but the scaled screenshot was not calibrated to logical iOS points. No spacing defect is inferred from the screenshot.
- Audible VoiceOver, announcement frequency and absence of countdown chatter. AX labels/actions were observed with VoiceOver off; no audio claim is made.
- Time-advanced native expiry/refill, offline and background/resume walkthroughs. Deterministic owner tests cover logic, while the fixture display clock remains frozen.
- Physical iPhone and live deployed API acceptance. Synthetic fixture screenshots cannot establish production platform/feed correctness.
- Exhaustive small/large-device, maximum Dynamic Type, landscape/keyboard and Reduce Motion combinations after this follow-up. Prior documented representative coverage remains relevant, but this audit did not repeat that matrix.
- Error-state Retry/Review selection appearance, Amber glow raster equivalence or performance, and all eight screens in both themes. Source preservation was inspected; this bounded runtime audit covered the screens stated above.
- App Store/TestFlight/signing, binary XLSX fidelity and fresh upstream provenance fetch. These were outside this review.

Keep PR #4 draft and NB-3 In Progress until the accepted manual gates are satisfied or explicitly waived by the user. Record the remaining rendered-spacing measurement limitation when publishing this follow-up; do not claim exact 18-point spacing was measured from these screenshots.
