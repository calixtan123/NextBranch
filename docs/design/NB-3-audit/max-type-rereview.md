# NB-3 maximum-type header re-review

10 November 2026. Scope: new font-scale adaptation in the shared `PlatformBoard` header only. Prior source/visual approvals stand. No source edits or suite reruns.

## Compliance verdict

**Source change accepted; rendered/test acceptance pending artifacts at this review point.** `useWindowDimensions()` provides the current font scale. Above 1.35 the station/platform identity and line indicator occupy vertically separated rows, allowing the station its full available width. This serves the specification's readable identity at large Dynamic Type sizes while preserving ordinary-scale reference layout. The threshold matches the existing train-row stacking breakpoint, rather than introducing a separate accessibility policy.

The shared component serves both Home and detail. Parent reports an actual iPhone 18 Pro maximum-size observation: Camden Town wraps on whole words, and Northern line occupies its own row. This is parent-observed runtime evidence, not an image inspected by this reviewer. It does not alone establish lower train rows/countdowns, small-device fit or the complete accessibility matrix.

## Quality verdict

**No new actionable issue in the inspected delta.** The conditional style overrides the existing row direction/alignment in the correct order. Removing `flex: 1` from the identity child when stacked avoids treating vertical height as the old horizontal fill constraint. The line row changes its cap from 38% to 100%, and its text aligns left when stacked. No fixed height or line limit is introduced. At scale ≤1.35 the existing header arrangement remains unchanged. Existing Heavy station text and regular secondary text are preserved.

## Evidence still needed for this delta

At initial inspection no header regression test or `max-type-*.png` captures existed. Review the eventual test for ordinary-scale and enlarged-scale behavior and inspect the supplied maximum-type capture when available. No test result is claimed here. Parent owns running the smallest sufficient check; this reviewer will not duplicate suite execution.

Broader acceptance gates remain those already listed in `current-diff-review.md`, narrowed by subsequent parent evidence. This header change does not reopen previously accepted startup/search/navigation/spacing or successful replacement/keyboard/reorder checks.

## Screenshot addendum

Inspected `max-type-detail.png` after it became available. The actual maximum-type detail header shows **Camden / Town** on whole-word lines, complete **Southbound · / Platform A** identity, and **Northern line** in its own full-width row. These elements fit the card without horizontal clipping or overlap. **Rendered acceptance of this header delta is now supported by an inspected screenshot**, superseding the initial artifact-pending status for the header image.

The first train begins below the header and extends beyond the current viewport. This still image does not establish its complete route/countdown readability or scrolling through remaining rows/actions; those remain separate parent runtime checks. A header regression test was not yet available at this inspection point.

## Final regression-test review

Inspected `native/tests/platform-board-layout.test.ts` once available. It invokes the real shared PlatformBoard and checks its element output at mocked native boundaries for both Home-card and expanded-detail variants. The eight parameterized cases cover scale 1, exact threshold 1.35, immediately above at 1.36, and enlarged scale 3.12. They protect ordinary row layout, stacked column layout, removal of identity flex, line width/alignment, and complete station/platform/line text. The helper applies conditional style arrays in order, matching the relevant style-precedence behavior; it does not mount native views or claim to measure actual glyph wrapping.

The long King's Cross station name is presentation-test input with a synthetic A/Southbound tuple. It does not modify the catalogue or imply that this physical platform has reviewed production provenance. Every case explicitly sets the mocked font scale; the tests are sequential and do not rely on a previous case's scale.

**Final compliance verdict for this delta: ACCEPTED.** Source change, inspected maximum-type header capture and the regression-test design cover the requested header adaptation. **Final quality verdict: ACCEPTED; no actionable finding.** Test execution remains the parent's responsibility; no suite was rerun and no new passing result is asserted by this reviewer. The previously pending test-review item is closed. Broader route/countdown/device/accessibility gates remain separate and unchanged by this narrowly scoped approval.
