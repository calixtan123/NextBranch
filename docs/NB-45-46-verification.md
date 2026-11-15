# NB-45 freshness verification

## Accepted age policy

Successful departures remain fresh through an actual conservative source age of 60,000 milliseconds. At 60,001 milliseconds they become stale and the accessible status reads `Departures are over 60 seconds old`. Native consumers share the exported `FRESH_FOR` value, including fixture ages and accessible wording.

The routine budget is 30 seconds from completion to the next polling start, up to 10 seconds of current server-cache age with a tolerated cache budget of 15 seconds, and up to 10 seconds of combined conservative latency across the previous and next request. The tolerated total is 55 seconds, leaving 5 seconds before the stale boundary. Request latency includes response-body parsing. The request deadline remains 20 seconds.

The age calculation continues to use the original successful feed timestamps through `responseAge` and `anchorResponse`. A successful cached response can still be stale when its source exceeds the threshold. Request failures, unavailable feeds and offline connectivity keep their existing status precedence. A suspended timing anchor requires a successful response after resume before it becomes live again.

## Controlled-clock evidence

The regression command initially failed all five new polling cases against the 30-second threshold.

```sh
npm --prefix native test -- --configLoader runner --cache=false tests/polling-freshness.test.ts
```

The focused verification command passed 223 tests across six files.

```sh
npm --prefix native test -- --configLoader runner --cache=false tests/polling-freshness.test.ts tests/response-timing.test.ts tests/departures.test.ts tests/platform-board-layout.test.ts tests/catalogue-fixture.test.ts tests/runtime.test.ts
```

- Repeated polling uses 5-second request latency and cache ages of 0, 10 and 15 seconds. Four request starts occur at 0, 35, 70 and 105 seconds. Status stays fresh before each start and through each pending request under this budget.
- The source-age boundary uses a 55-second-old cached source and a 5-second request. Data is fresh at exactly 60,000 milliseconds and stale one millisecond later.
- A successful 19-second request exceeds the normal latency budget. Existing data becomes stale while the request is pending and recovers when that successful response arrives.
- Alias polling reuses the original cached source age. A successful response at 45 seconds is fresh, then becomes stale at 60,001 milliseconds without a source-age reset.
- Failure, partial-feed and offline status precedence is checked with both fresh and overdue source data. Existing owner tests continue to cover the 20-second request deadline, offline polling pauses and shared rate limits.
- Background/resume checks cover a suspended clock, failure after resuming and eventual successful recovery.
- Compact and expanded boards verify the boundary, warning text, accessible status and semantic status-dot colour in Modern and Amber styles and in light and dark appearances.
- Deterministic fixture/runtime tests confirm exact ages of 60,000 and 60,001 milliseconds while request scheduling advances. Existing countdown tests retain their original nearest-minute and Due boundaries.

Native type checking and whitespace validation both passed with exit code 0.

```sh
npm --prefix native run typecheck
git diff --check
```

Controlled-clock and React element assertions provide the evidence recorded here. Physical-device VoiceOver and live-network observations remain release verification work.

# NB-46 preference recovery verification

## Recovery and preservation policy

Preference loading classifies decoded data explicitly as valid, corrupt or a future version. Malformed JSON, invalid roots, malformed or unsupported version values and corrupt version-one fields recover to defaults with valid-entry salvage. The decoder validates unknown values before reading their fields. Shape-valid saved selections retain historical recovery and canonical identity migration even when the current catalogue cannot offer them for a new save. Missing optional interface appearance and card style remain compatible with older version-one data.

A well-formed object with an integer version greater than one is protected before validating its other fields. Its original stored bytes remain intact and the app explains that a newer app version saved them. A storage read rejection also disables writes and keeps the existing read/session-only warning. Changes in these protected sessions still work in memory.

Corruption recovery enqueues a version-one snapshot through the existing serialized write queue. The queue captures JSON before notifying subscribers, so a subscriber saving immediately on readiness cannot overtake recovery. Each rapid change keeps its own immutable snapshot. Successful recovery retains its explanatory reset warning. A later successful user save clears that explanation. A rejected reset reports `Could not save platform preferences. Changes may only be available for this session.` and a later save can retry successfully.

## Behavioral evidence

Tests use Arrange / Act / Assert. Arrange seeds stored bytes or a controlled storage failure. Act loads preferences, makes changes and flushes queued writes. Assert checks visible state, warnings, exact stored snapshots and a newly created preferences owner loading the saved result.

The initial regression command failed 17 cases with 11 passing against the previous implementation. After recovery was implemented, the 28 cases passed. An additional subscriber-ordering regression initially failed with 28 passing, then passed after enqueueing snapshots before listener notification.

```sh
npm --prefix native test -- --configLoader runner --cache=false tests/preferences.test.ts
```

The final related verification passed 200 tests across ten files, including 29 focused preference cases.

```sh
npm --prefix native test -- --configLoader runner --cache=false tests/preferences.test.ts tests/canonical-saved.test.ts tests/offline-discovery.test.ts tests/manage-reorder.test.ts tests/interface-controls.test.ts tests/settings-theme.test.ts tests/app-navigation.test.ts tests/live-screens.test.ts tests/glass-controls.test.ts tests/about-privacy.test.ts
```

Coverage includes valid legacy records, malformed JSON, primitive and array roots, missing required fields, malformed version values, invalid collection fields, invalid entries with retained selections/style/theme/recents, future-version byte preservation, read failure with zero writes, rejected recovery followed by a successful save and relaunch, delayed recovery followed by rapid queued changes, and immediate saves from readiness subscribers. Existing tests also cover save failures, duplicate/overflow handling, undo, reorder, canonical saved identity and interface appearance persistence.

Native type checking and whitespace validation passed with exit code 0.

```sh
npm --prefix native run typecheck
git diff --check
```

These checks use controlled asynchronous storage. Physical-device AsyncStorage persistence, supported app-update behavior and release-device verification remain under NB-32.
