# NB-7 native saved platforms verification

The native app identifies a saved physical platform by canonical station ID and platform ID. On load, it migrates a legacy station/number/direction tuple only when exactly one eligible physical platform matches. Unresolved records remain in the ordered list for review, including their style, and can still be removed or restored with Undo. A migration is recomputed on reload until the next preference write persists it. Matching does not require a successful network response.

Save eligibility uses the shared `serviceCapability` evidence: at least one service must have a supported feed and supported platform mapping. All published services remain visible, with individual coverage descriptions. Unsupported and unverified platforms remain browsable; Northern is the only currently verified live mapping. Other modes require NB-8 through NB-12 evidence. The unknown-direction save test uses explicitly synthetic evidence; it does not establish any real mapping.

Automated screen-boundary walkthrough: `native/tests/offline-discovery.test.ts` renders the real search, picker, departures and Home screens with native controls mocked and real catalogue and preference owners. For both an unavailable request and an empty snapshot, it searches Colindale, chooses platform 1, saves, reloads storage, renders Home and reopens the saved board. It does not render a device or simulate gestures, networking, background lifecycle or live TfL. No simulator or physical-device walkthrough was performed here.

Focused tests also cover exact physical-ID board matching, retained wire metadata, ambiguous and removed legacy records, duplicate migration, synthetic unknown-direction saving and partial versus unverified capability. A subsequently added synthetic all-unsupported case verifies catalogue save gating and direct preferences-save rejection. Existing native tests cover ordering, three-card limit, explicit replacement, Undo, request sharing, 429 and synthetic fixture replay. Existing server tests cover Northern matching and journey regressions.

Verification on this worktree:

- `npm --prefix native test` — exit 0, 83 tests passed in the controller's final candidate run, including the subsequent all-unsupported case. The implementer's earlier full run passed 82 tests.
- `npm --prefix native run typecheck` — exit 0.
- `npm --prefix native run export:ios` — exit 0. The implementer's earlier run emitted `NO_COLOR`/`FORCE_COLOR` warnings.
- `npm run verify` — exit 0, lint and typecheck passed, 291 tests passed.
- `python3 -m pytest -q tests/catalogue` — exit 0, 14 passed.
- `git diff --check` — exit 0.

Independent task review and fresh whole-ticket review approved implementation compliance and code quality. Latest-head CI and device/simulator assessment remain delivery-controller responsibilities. Local checks and review do not establish their completion.
