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
