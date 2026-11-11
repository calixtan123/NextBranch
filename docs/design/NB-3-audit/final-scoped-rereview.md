# NB-3 final scoped re-review

Reviewed 10 November 2026. Independent read-only review of the current source, typography worker report, pinned reference captures and newly supplied native captures. No native UI control, implementation edits or test reruns were performed.

## Separate verdicts

- **Spec/design:** the four concrete typography/spacing corrections are accepted at source level. The post-change Home capture supports the corrected Heavy station face and regular secondary text without clipping. Current landscape Search and Picker close the prior stale-picker and absent-software-keyboard evidence gaps for the tested Camden query. Full device/accessibility acceptance remains pending the root agent's runtime checks; this is missing evidence, not a demonstrated code failure.
- **Quality:** no new actionable P1/P2 defect found in this scoped review. V1 is resolved in source and supported by the supplied Home render. V2 is resolved in source, with post-change Manage/Card Display visual and drag checks still to be supplied. The worker reports 25 native tests plus typecheck passing; this reviewer did not rerun them and does not treat those checks as proof of UIKit or accessibility behavior.

## Source corrections checked

`native/src/theme.tsx` ordinary Label weight is now 400 and bold remains 700. `native/src/PlatformBoard.tsx` station labels override to 800. This matches the established AvenirNext-Regular/Bold/Heavy mapping from Chromium reference-font inspection and the installed React Native converter. The style override follows the base Label style, so 800 is effective.

`native/src/ManageScreens.tsx` mapped row wrapper now has marginBottom 8, including replacement rows. Layout measurement still records each actual row's y and height; nearest-center drag selection uses those measured frames, with no hard-coded row stride invalidated by the new margin. This is a sound source change, although a post-change drag is still useful runtime confirmation. Card Display Done now uses marginTop 16. Existing 44-point action targets and the prior navigation/search fixes remain intact in the inspected code.

## Updated native evidence

| Evidence | Accepted observation | Boundary |
| --- | --- | --- |
| `search-landscape-keyboard.png` | Real software keyboard is visible. The complete Camden Town result and its secondary line fit above the keyboard after scrolling; header Back and Cancel remain visible. | Root reports that tapping this result succeeded. This establishes the tested single-result query in landscape, not all long result lists or short portrait layouts. |
| `picker-landscape-current.png` | Current full-screen landscape Picker has Camden Town, Southbound heading, complete A/B rows, fixture notice and Back; no stale rounded modal shell or clipped choices. | Screenshot plus root-reported Search→Picker transition closes the previous stale-picker concern. Does not itself prove Back/Cancel behavior. |
| `home-typography-final.png` | Heavier station names and lighter secondary labels are coherent and legible, without clipping. Amber destination rows fit; Colindale B empty state is clearly distinguished. | Compared with `reference-home-amber-dark-402.png`, using matched logical content width. Saved selections/order differ after runtime management tests, so this is a typography/layout comparison rather than an identical-data pixel diff. Native safe areas and real system bars intentionally differ from the prototype. |

## Acceptance matrix for root consolidation

| Area | Current audit status |
| --- | --- |
| Eight pinned reference screen states | Captured; original and adapted 402-point-content references exist. |
| P3 V1 font mapping | Source accepted; post-change Home visual accepted for ordinary text/board station treatment. |
| P3 V2 Manage and Card Display spacing | Source accepted; final native renders and drag after margin change pending. |
| Landscape keyboard result selection/current Picker | Accepted for tested Camden query using screenshots plus root's successful interaction report. |
| Short portrait keyboard/last-result reachability | Pending runtime evidence. |
| Back, Cancel, keyboard dismissal | Pending consolidated runtime evidence. |
| Small/large iPhone, maximum Dynamic Type, Reduce Motion | Pending runtime evidence. Landscape is now covered for Search and Picker. |
| VoiceOver train/card/selected-state reading, non-drag actions, refresh announcement | Pending runtime evidence; still images cannot establish it. |
| Management removal/Undo/reorder/confirmation presentation | Earlier screenshots establish visible states. Final restart persistence, Undo expiry, replacement cancel/confirm result and post-spacing drag evidence pending consolidation. |
| Four commuter walkthroughs | Pending consolidated runtime evidence. |
| Physical iPhone/live API | Record as environment limitations if unavailable; not code defects. |

This matrix reports only evidence delivered to this reviewer and must be merged with newer root findings. Do not infer final Jira acceptance or Done from this supplemental assessment. Previous statements that all keyboard evidence is absent, that the current picker is stale, or that V1/V2 remain unfixed in source are superseded.

Related reports: `supplemental-screen-review.md`, `typography-fix-report.md`, `runtime-independent-review.md`. All relative artifact names in this report are under `/private/tmp/nb3-native-audit/`.

## Final typography/spacing capture addendum

Inspected `manage-typography-final.png` and `card-display-typography-final.png` against the corresponding `reference-*-dark-402.png` references. Corrected Manage row separation and Card Display Done spacing are present; text, selected border/check, controls and fixture notice are legible and do not overlap. Wider native grip/trash target allocation remains an intentional specification adaptation. **V2 is now resolved visually as well as in source.** V1/V2 no longer represent outstanding actionable findings.

Root reports a successful post-spacing drag moving Colindale from first to last while preserving Camden B/A order; the final Manage screenshot shows that resulting order. Root also reports terminating and relaunching the app restored three cards, their order and styles. Accept those interaction checks as parent-observed evidence, distinct from this reviewer's screenshot inspection. Root reports fresh verification of 260 root tests, 25 native tests, native typecheck and native export, all exit 0.

Inspected `card-display-max-type.png`: the header, station, platform and explanatory text wrap within horizontal bounds at the supplied maximum text size. Options are below the initial viewport; root reports scrolling remained functional. This is positive Card Display text scaling evidence, but does not substitute for maximum-size Home/board, all actionable options, small-device or VoiceOver checks.

**Current scoped verdict:** spec/design corrections accepted; no new actionable quality finding in the reviewed scope. Remaining acceptance work concerns the device/accessibility/runtime matrix above, with post-spacing drag and restart persistence now removed from the pending list.
