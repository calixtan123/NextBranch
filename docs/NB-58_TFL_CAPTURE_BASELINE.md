# TfL capture baseline

The source candidate is NextBranch main commit `0aca83f4f2dfbd3d717f60bedd794dd1d78636d6`. The catalogue is the 10 November 2026 retrieval of the 20 October 2026 TfL archive. Its checked-in JSON has Git blob ID `72adb00c7efcb40ddc56feefc600ef9dac5e5f5b`. This freezes the code under test. The deployed commit and the final release line list still need confirmation.

[Enabled arrivals feeds](NB-58_ENABLED_ARRIVAL_FEEDS.csv) lists all 627 unique pairs across the 20 lines currently enabled by the backend. The export used the application's `catalogue.stations.flatMap(departureFeeds)` and deduplicated line and stop ID across station and platform entries. These are the lines eligible for measurement. Northern is the first line to sample. Each line needs coverage evidence before a launch recommendation.

| Northern sample | Stop ID |
| --- | --- |
| Camden Town | 940GZZLUCTN |
| Colindale | 940GZZLUCND |
| Kennington | 940GZZLUKNG |
| Battersea Power Station | 940GZZBPSUST |
| Morden | 940GZZLUMDN |
| Bank | 940GZZLUBNK |

The API advertises a 30-second refresh interval. The native foreground station owner uses that interval when polling. Its current age rule marks a snapshot stale above **60 seconds** and on a request error or loss of connectivity. Source age is calculated from the original feed observation time using the server-relative clock. The **30-second** target in the capacity plan is a proposed release criterion and needs its own acceptance check. The backend currently reuses successful arrivals for 10 seconds within a single runtime.

## Subscription and available headroom

The repository documents a 15 November Vercel observation, but it does not establish today's active deployment or outbound request count. GitHub returned no Deployments records for this repository. The account owner's 20 November Vercel screenshot confirms that the project variable `TFL_API_KEY` targets Production and Preview. The screenshot also shows that `NEXTBRANCH_API_PROTECTION` targets Production. Deployment commits, which previews are serving traffic, and outbound request counts still need verification. On 20 November the account owner reported that the longest available one-hour Runtime Logs view was empty with no search filter. This observation does not establish outbound usage during the planned peak and off-peak windows or usage by consumers outside Vercel.

The account owner confirmed a limit of 500 requests per minute for the NextBranch key on 19 November 2026. Use 400 attempts per rolling 60 seconds as the provisional operating ceiling. Current shared traffic still needs verification. Keep the remaining 100 for safety margin. A rolling window means checking the preceding 60 seconds at every attempt, including attempts that time out or fail. [TfL API products](https://api-portal.tfl.gov.uk/products)

| Workload that may share the key | Evidence to collect |
| --- | --- |
| Vercel production, previews, and any staging environment | Confirm deployed commit and which active environment uses the same key. Measure outbound attempts during the planned sample window. |
| Netlify beta or rollback environment | Confirm whether active and whether its Functions use the same key. Include its attempts if enabled. |
| Local dev servers and device clients | A local development configuration contains a TfL key assignment. Verify whether it shares the quota and whether the server is running. Pause confirmed shared local consumers during sampling or reserve capacity for their departures and journeys. |
| Departures (native and web) | Count each enabled line-and-stop request actually sent by the service, including cold misses and failures. A station request can fan out to multiple feeds. |
| Web journeys | Count both arrivals lookups, and topology and timetable cache misses. |
| Discovery scripts, scheduled jobs and other integrations | Check account usage and deployment/job inventories. Pause them or reserve their maximum rolling-minute usage. |

For each window, list confirmed active workloads, record their measured maximum or reserved allowance, and subtract the combined allowance from the operating ceiling. Allocate the smaller of the remainder and 30 attempts per minute to one serial capture process. Until the shared workloads have been accounted for, allocate **zero live capture attempts**. Repo configuration and checked-in documentation show possible consumers. Actual deployment configuration and account-side usage are required to establish which consumers share this key.

Refreshing all 627 line-and-stop feeds every 20 seconds would require 1,881 TfL attempts per minute before journeys or retries. If all 20 whole-line feeds pass NB-59, one shared refresh per line every 20 seconds would require 60 arrivals attempts per minute. This is a model of refresh demand. NB-59 tests whether the line feeds have enough coverage and NB-60 tests whether deployments actually share refreshes and enforce the budget.

## Measuring the hosted workload

Once the measurement code is running on the deployment under test, use Vercel Runtime Logs to find `tfl_fetch_attempt` entries from both Production and Preview. Collect the complete timestamp series for each planned test window, including the preceding 60 seconds. Save the timestamps while they are still within the host's retention window. Keep only timestamps and the deployment or environment label. Do not export request URLs, credentials, or user details.

Sort the combined timestamps and, for each entry, count entries in the preceding 60 seconds, including that entry. Keep the largest count per test window. Count failures too. For example, if the largest combined hosted count is 120 and other workloads have a combined reservation of 40, that leaves 240 attempts against the 400-attempt operating ceiling. The capture still caps at 30.

The marker counts calls to the framework's fetch function. A topology or timetable response served from the framework cache can produce a marker without using the key. This makes a complete count conservative for that deployment. An empty or incomplete result alone cannot establish spare capacity. Confirm the measurement code is deployed and that the host retained the whole window. Treat older deployments, local processes, and jobs that do not emit the marker separately. Historical counts describe observed traffic. Review live traffic and keep a reservation for variability during captures.

## Follow-on verification

NB-59 needs live stop/line/stop comparisons before a line can use the whole-line feed. NB-60 needs those captures and synthetic failure cases. Current arrivals reuse and duplicate-request suppression use process-local maps, so two backend instances have independent state. The host's incoming request limits do not count every outgoing TfL attempt. The remaining proof must show shared refresh ownership, an outgoing budget covering both arrivals and journey-related calls, and freshness through the native UI.

## Running and reading a capture

Run the offline proof first from the repository root.

```sh
python3 -m pytest -q tests/release/test_capture_tfl_arrivals.py
```

After verifying the workload allowance, set `TFL_API_KEY` through the environment and set `TFL_CAPTURE_ALLOWANCE` to the number of attempts reserved for the capture. The example makes at most three attempts if that headroom is available.

```sh
python3 scripts/capture-tfl-arrivals.py --live \
  --line northern --stop 940GZZLUCTN \
  --available-headroom "${TFL_CAPTURE_ALLOWANCE:?Set the reviewed attempts-per-minute allowance}" \
  --output /tmp/tfl-northern-camden.json
```

Repeat `--stop` within one invocation for other reviewed stops so they share the same rolling budget. Run only one capture process at a time. After any invocation ends, including a successful run or an interrupted run, wait at least 60 seconds before starting another. The runner tracks attempts only within a single process, so this pause lets every previous attempt age out. Confirm the shared-key allowance still holds before restarting. On HTTP 429 (rate limit), keep the partial result and wait for the longer of the 60-second pause or the recorded Retry-After cooldown. Review total workload and establish spare capacity before resuming, including when TfL provides no valid delay.

The manifest identifies the format version, UTC capture time, and ordered triads. Each triad identifies the line and stop and contains the before-stop, whole-line, and after-stop samples, plus elapsed milliseconds for the triad. Each sample records UTC start and completion times, HTTP status, duration, response byte count, body classification, sanitized Retry-After when applicable, and a limited set of prediction fields. A body read failure is marked `read-error` and retains the HTTP status, with zero retained bytes and no prediction records. Exclude triads with a read failure from departure comparisons and include the failed attempt in usage totals. A stopped run adds a reason and may contain an incomplete triad. Keep manifests outside the repository until reviewed for release evidence.
