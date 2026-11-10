# NB-3 final acceptance evidence addendum

10 November 2026. Scoped consolidation of existing approvals and newly supplied runtime captures. No source changes, repository-document edits, test reruns or native UI actions were performed. This addendum updates `acceptance-consolidation.md` and `closing-evidence.md`; prior source and visual approvals stand.

## Newly inspected maximum-type evidence

The controller identifies these captures as representative small and large iPhone runs at maximum Dynamic Type. The images establish the visible layout below; exact device models and OS setting values belong to the controller's run record rather than inference from filenames. Small captures are 1170 × 2532 pixels; large captures are 1320 × 2868 pixels.

| Capture | Independently visible evidence |
| --- | --- |
| `small-max-type-route.png` | Scrolled light-theme detail shows the fifth train's complete Morden destination, Branch unavailable fallback and 5 min / 13:05. The preceding row is partly outside the viewport. |
| `small-max-detail-route-complete.png` | Light-theme detail shows a complete Morden via Charing Cross row with 2 min / 13:02. The next row visibly names Morden via Bank, with its time below the viewport. No horizontal truncation of the complete first row is visible. |
| `small-max-detail-actions.png` | Scrolled light-theme detail exposes complete Saved and Refresh actions and the illustrative/synthetic/not-live disclosure. |
| `large-max-home-route.png` | Dark-theme Home shows Colindale, Southbound / Platform A, Northern line, then complete Morden via Bank / 1 min and Morden via Charing Cross / 2 min rows. |
| `large-max-detail-actions.png` | Dark-theme detail shows the complete fourth Morden via Charing Cross row with 4 min / 13:04, update/count information, Saved, Refresh and fixture disclosure. |

These captures, together with the controller's observation that scrolling exposes the routes and lower actions, close the prior representative small/large maximum-type essential-content evidence gap. Home and detail, advertised Bank/Charing Cross wording, unknown-branch fallback, countdowns and lower actions are represented across this set. This is representative coverage; it does not claim every screen/device/theme permutation, and there is no reason to require that Cartesian product.

The small-device detail screen title visibly wraps `Platform departures` across three lines, including `departure` followed by `s`, and takes substantial vertical space. This is an observed layout limitation, not a claim that the title has elegant typography. The supplied images nevertheless show complete essential route information and reachable lower actions. It does not reopen the separately accepted board-header fix or establish inaccessible content. Cropped material at the top/bottom of a scrolled viewport is not itself evidence of text truncation.

## Management and Undo artifact inventory

Native runtime captures inventoried: `manage-dark-final.png`, `manage-typography-final.png`, `manage-removed-undo.png`, `manage-undo-restored.png`, `manage-reordered.png`, `replace-selection.png`, `replace-confirmation.png`, `replace-completed.png`, and `undo-expiry-empty-home.png`.

The removal/restoration pair was opened again for this addendum. The first image shows Colindale A followed by Camden B and an Undo removal action; the second shows Colindale A, Camden A, Camden B with no Undo action. This supports visible removal and restoration into the middle slot. It does not measure a five-second interval or independently establish assistive-technology activation.

The already inspected replacement sequence remains accepted: selecting Colindale A for incoming Colindale B, explicit old/new confirmation, then Home 3/3 ordered Colindale B, Camden B, Camden A. Successful visible one-slot replacement is closed. Replacement Cancel remains unverified by these artifacts.

As recorded in `closing-evidence.md`, `undo-expiry-empty-home.png` actually shows Search stations with recents. It must not be cited as empty Home, clean launch or timed Undo expiry. Files prefixed `reference-manage` or `reference-replace` are browser reference renders, not native runtime outcomes.

## Current verification notes and evidence boundaries

Read the current repository `docs/design/NB-3-verification.md` and `header-test-report.md`; neither was edited. The repository record still lists maximum-type route/device evidence and successful replacement result as pending. Those entries are now stale and can be updated by the controller using this addendum and `closing-evidence.md`.

The header test worker explicitly records:

```sh
npm test -- tests/platform-board-layout.test.ts && npm run typecheck && git diff --check -- tests/platform-board-layout.test.ts
```

Result: exit 0; eight focused tests passed, native TypeScript passed, scoped whitespace check clean. These are element-output tests, not UIKit text measurements. The previous full native suite result remains 25 tests in the supplied record; eight additional focused passes do not establish a fresh full-suite run of 33. Root verification 260 tests and the prior iOS export are controller-reported existing evidence, not new runs by this reviewer.

Previously accepted runtime observations continue to count: saved navigation, portrait and landscape keyboard/search recovery, drag and non-drag reorder, process restart retaining selections/order/styles, and maximum-type Manage/Card Display scrolling. No request is made to repeat successful checks merely because this addendum is newer.

## Remaining acceptance record

The following remain unverified in the evidence supplied to this reviewer, unless the controller has newer explicit observations to append:

1. Reduce Motion runtime behavior.
2. VoiceOver meaningful card/train and selected-option speech, decorative dot handling, accessible removal/Undo, one refresh-completion announcement and no routine countdown chatter. If tools cannot operate/observe VoiceOver, record the concrete obstruction and retain the unverified status.
3. Replacement Cancel preserving records and timed five-second Undo expiry. Successful confirmation/replacement and visible restoration are already covered.
4. Global Amber/Modern changes followed by Custom retaining per-card overrides, with effective Home/detail style agreement. Restart persistence alone does not prove that transition sequence.
5. Consolidation of the four named commuter walkthroughs, distinguishing observed native UI from deterministic owner tests. Earlier missing portions include empty launch through save, independent station failure, and expiry/failed refresh through retry/offline/background-resume. Reuse existing observations where available.
6. Explicit passed or unavailable status for physical-iPhone and live-API checks, naming the actual environment limitation. Fixture disclosure correctly prevents these screenshots being mistaken for live data.
7. Final documentation/Jira evidence and lifecycle, owned by the controller. The six reviewed Colindale/Camden production tuples and recoverable unsupported-station behavior must remain explicit; High Barnet cannot be reported as a successful reviewed-platform selection.

**Scoped outcome:** no new actionable source finding was sought or established, and the prior accepted fixes remain accepted. The newly inspected captures close the representative maximum-type essential-content gap. Full runtime/accessibility acceptance is still not demonstrated by this supplied record; do not mark the remaining unobserved checks passed through inference from source, tests or screenshot filenames.

All image and report basenames above resolve under `/private/tmp/nb3-native-audit/`. These are local temporary artifacts; durable delivery/attachment remains controller-owned.
