# NB-3 theme follow-up: fresh final whole-branch review

Reviewed 10 November 2026. Read-only source review of `feat/NB-3-native-ui`, committed HEAD `5caa899cc10d44c0501eed8ead12b36c903b6821`, plus the uncommitted theme changes and `native/tests/settings-theme.test.ts`. The assignment subsequently expanded to a bounded native UI audit, recorded below. No source edits, publishing, Jira changes, servers or additional agents by this reviewer.

## Specification verdict

**PASS for source implementation review. Zero blocking specification findings. Native acceptance remains incomplete.**

The requested native Dark Mode switch is present directly in Settings. It changes the effective application palette immediately and saves an explicit light/dark preference. Legacy, missing and invalid stored choices continue following the system until an explicit selection. Native appearance is also set, rather than only changing JavaScript component colors. Existing card identity, order, styles, runtime ownership and navigation structure are preserved.

This verdict permits continuing the draft-PR workflow with its remaining checks. It does not authorize marking NB-3 Done or marking PR #4 ready for review.

## Code-quality verdict

**PASS. Zero blocking correctness, maintainability or regression findings established.**

The change adds a small field and guarded setter to the existing preference owner instead of introducing another storage or theme owner. It uses the established synchronous snapshot publication and serialized writes, with the existing usable-session behavior and visible warnings on storage failure. The root subscription uses the same immutable snapshots already used by screens. No dependencies or new background processes were added.

## Scope and base interpretation

Read `docs/design/NB-3-spec.md`, `docs/design/NB-3-verification.md`, `/private/tmp/nb3-theme-toggle-plan.md`, `.superpowers/sdd/nb3-theme-toggle-plan/task-1-review.md`, and the accepted `ui-followup-review.md` and `ui-followup-final-audit.md` reports.

Inspected the whole-branch diff inventory, current native root, screens, shared presentation, preferences, station owner, API transport/validation, board projection/renderer, catalogue and fixtures. Inspected all new theme test cases and the changed CI, package/configuration and shared web-code integration. The targeted review supplements the prior accepted whole-branch reports; their earlier native observations are attributed to those reviewers and are not new observations by this reviewer.

Local `main` is now `50c2ba211ee0da7a83c007c5520e382dacc00995`. The merge-base with this branch remains `0dd90324c186578ee8b05243fcead93009d32d4d`. Direct `git diff main` consequently displays NB-4 catalogue artifacts and their README section as absent from this branch. `git log main` and the merge-base comparison establish that these were added on main after divergence; they are not deletions introduced by NB-3. Do not restore, remove or otherwise change those unrelated artifacts based on that direct comparison.

## Theme integration findings

- `native/src/ManageScreens.tsx:192` renders an actual React Native `Switch`, explicitly named Dark Mode with switch semantics. Its state follows the effective palette, it is disabled while preferences load, and the callback chooses explicit light/dark values. The scalable label, padded row and expanded switch touch insets preserve the intended accessible target. Existing Appearance and Manage cards navigation remains intact.
- `native/src/preferences.ts:26` validates the optional stored value while retaining version 1 and all previous card/mode/recent decoding. `native/src/preferences.ts:67` includes the current interface choice in every queued snapshot, including later card operations. `native/src/preferences.ts:171` rejects pre-load changes and avoids redundant commits. Read failure still allows session-only selection; write failure still leaves the immediately selected state usable and exposes the warning through Surface.
- `native/src/App.tsx:18` holds the runtime in state and subscribes to preference snapshots. The effective choice drives the context palette, safe-area background, navigation theme, native-stack background and StatusBar. The navigator remains declared at module scope, and the station lifecycle effect retains stable dependencies. Preference changes therefore do not replace runtime owners or construct a new navigator type.
- `native/src/App.tsx:69` applies explicit native appearance or `unspecified`. Inspected the installed React Native `Appearance.js` and `RCTAppearance.mm`: this version accepts `unspecified` and applies native interface style to connected app windows. `native/app.json` continues to allow automatic system appearance. This supports the source-level alert/keyboard integration; it is not proof of rendered native presentation.
- Amber/Modern board rendering, effective card-style selection, canonical tuple identity, selection cap, replacement/Undo behavior and station-keyed ownership are unchanged by the theme follow-up. Whole-branch inspection found no new conflict with exact platform filtering, expiration-before-limiting, retained stale data, cancellation of removed ownership or fixture isolation.

## Verification evidence

Independently ran `git diff --check`: exit 0. Read the controller's saved logs showing native tests **43 passed across 10 files**, root verification **260 passed across 34 files**, successful native TypeScript checking and successful iOS Hermes export. The controller reports fresh reruns of `npm --prefix native test`, native typecheck/export, root `npm run verify` and diff checking on the review tree, all passing. No test suites or builds were rerun by this reviewer because fresh sufficient verification was already available.

Read the new tests for legacy/invalid values, preserved card fields, pre-load guard, serialized rapid choices, later card writes, persisted light/dark reload, read/write failures, actual Settings callbacks and root presentation props. The independent task reviewer also recorded 13 passing targeted tests. These tests appropriately use the real preference owner with mocked native boundaries. Mocked hooks and manual component invocations do not establish actual native subscription rendering or navigation retention.

## Open acceptance boundaries

The bounded Simulator observations below supplement the source verdict. App process-restart restoration and software keyboard appearance were not verified by this reviewer; the controller is handling restart verification separately. A persisted-owner reload test alone is not a process-restart walkthrough.

Earlier open gates remain: updated finger-drag behavior; audible VoiceOver and refresh/countdown announcement behavior; time-advanced native expiry/refill, offline and background/resume flows; physical-iPhone and deployed live-API acceptance; and the disclosed limits of the device/text-size/orientation matrix. Prior exact Home-spacing measurement limits also remain unless the controller supplies new evidence. Fixture verification does not establish production feed or platform provenance beyond the reviewed catalogue.

Latest-head remote CI must pass after committing and publishing this follow-up. Retain **PR #4 as draft** and **NB-3 In Progress** while the accepted manual gates remain unresolved. No blocking source finding is being substituted for, or used to close, those gates.

## Blocking findings

None. No actionable severity/file/line defect was established in either review axis.

## Bounded native theme audit

Used Device Hub with iPhone 17e, iOS 27.2, portrait, connected to the controller's fresh Metro preview on port 8082. The inspector showed system Appearance Dark, Text Size 2, Reduce Motion enabled and VoiceOver enabled throughout. This is visual and accessibility-tree evidence, not an audible VoiceOver assessment.

- Initial Home had zero saved cards. Settings showed explicit Light despite system Dark, with the native Dark Mode switch off.
- Changed Light to Dark and Dark to Light. Each effective transition retained Settings, visibly changed the surface and text palette, and changed status-bar icon contrast. The switch exposed the name Dark Mode and corresponding off/on accessibility value.
- Returned to Home and navigated through Search, station/platform selection, detail, Home and Manage successfully after changing theme. Saved one synthetic fixture card, Colindale / Southbound / Platform A, solely to expose the reorder alert. It remains saved for the controller's persistence check; this is a reviewer-created change to Simulator fixture preferences.
- In explicit Light while system remained Dark, the native reorder alert rendered light. With only one card it offered Cancel. This confirms the native alert respected the explicit app appearance in that observed state.
- The station field displayed a caret, but the software keyboard did not appear. Keyboard appearance remains unverified.
- After cancelling the reorder alert, the native app remained visibly on Manage in Light, but Device Hub's accessibility tree no longer exposed app controls. A single coordinate recovery attempt failed with `windowNotFoundAtPosition`. This is a tooling limitation, with no source defect established. UI control was released to the controller to restart, check persistence, restore Dark and capture an isolated native screenshot. This reviewer did not perform a process restart or verify the final Dark restoration.

Whole-window evidence saved under `/private/tmp/nb3-native-audit/`: `theme-settings-light.png`, `theme-settings-dark.png`, `theme-home-light.png`, and `theme-alert-light.png`. These are bounded observations on one simulator configuration. They do not close the earlier manual acceptance gates.
