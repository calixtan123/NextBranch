# TestFlight request protection

## Status and release boundary

NB-28 supplies repository configuration for distributed Netlify enforcement.
Deployed acceptance remains pending because the Netlify account is suspended.
Local tests cover declarations, matching and the response contract. A restored
account and a verified deploy are required before external release. The actual
TfL key entitlement and intended tester group also remain pending.

## Selected provisional policy

Each public endpoint has an independent rule allowing 60 requests in a
60-second window for each domain/IP pair. The two Edge Functions target
`/api/departures{/}?` and `/api/journey{/}?`. The URLPattern optional slash
covers both canonical and trailing-slash requests with one declaration per
endpoint. All methods at these paths contribute to the policy. Allowed
requests continue through the existing request chain. Denied requests rewrite
to `/api/rate-limited`, which returns HTTP 429, the shared JSON body
`{"error":"RATE_LIMITED","retryAfterSeconds":30}`, `Retry-After: 30` and
`Cache-Control: no-store`.

Netlify supports arrays of paths on a function. Two endpoint-specific functions
keep the counters independent and avoid relying on undocumented multi-path
counter accounting. The host stores traffic configuration per function, and
its public rule semantics count each matching rule against its own limit.
Canonical and slash spellings select the same endpoint rule. The fallback
matches neither rule. The root TypeScript check includes the host files and
validates their declarations against `@netlify/edge-functions`.
[Netlify declarations](https://docs.netlify.com/build/edge-functions/declarations/)
[Netlify manifest implementation](https://github.com/netlify/edge-bundler/blob/main/node/manifest.ts)
[Netlify rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)

Free allows two code-based rules per project. This configuration uses both.
Its per-IP/domain aggregation allows many IPs to consume separate allowances.
Netlify enforcement can take up to 10 seconds after a threshold is crossed,
allowing additional upstream calls during that interval. This policy provides
provisional abuse protection. The shared TfL key budget still needs separate
usage observation and entitlement confirmation.
[Netlify rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)

## Client traffic and upstream fan-out

The native station owner shares one request and polling timer per canonical
station across Home cards, service aliases and station detail. Three cards
showing the same station share a single poll. Three distinct stations cause at
most three regular requests every 30 seconds, or six departures requests per
minute per active client. Inactive/offline clients pause. Startup or resume
can produce three requests together. Manual refresh shares station work and
has a 10-second per-station cooldown.

A 429 creates an app-wide retry deadline. New station ownership, manual
refresh and resume respect that deadline. Existing snapshots remain visible,
with stale/error status as appropriate. After the deadline, polling resumes
and successful responses clear the affected errors. The existing native
`departures.test.ts` suite exercises three-card station sharing, alias sharing,
manual cooldown, 429 deadlines, resume and recovery.

The provisional sizing assumption is up to five concurrent three-station
clients behind one IP. Their regular polling totals 30 public requests/minute.
A simultaneous startup can add 15 requests and a manual-refresh burst can add
15. Repeated manual refreshing or further clients can exceed the allowance.
Shared office, home or station Wi-Fi users share a bucket and can receive 429
together. The actual tester group needs to be recorded before external release.

An offline evaluation of the actual `departureFeeds()` function over all 460
passenger stations found a maximum of seven supported distinct line/stop feeds,
at Liverpool Street and Paddington. Each departures response requests its
supported feeds once. Simultaneous identical arrival requests share in-flight
work, with no cache across successive polls. Thus one client polling three
worst-case stations can cause 42 arrival calls/minute, five such clients can
cause 210, and 60 admitted departures requests can cause 420 per IP/window.
These arithmetic bounds exclude enforcement-lag traffic and additional IPs.

Journey requests have separate upstream work, including route topology,
origin and destination arrivals, and a timetable. Those calls add to the same
TfL key's usage. Measure actual calls by operation and status when validating
the deploy and include both public endpoints in the usage budget.

TfL portal product defaults are contextual. The published anonymous and normal
subscription products do not establish this application's actual entitlement.
Record the selected key's product, requests/minute allowance and any daily or
other constraints in release evidence without recording the key itself.
[TfL API products](https://api-portal.tfl.gov.uk/products)

## Usage observation and quota exhaustion

During controlled beta validation, record the deployment identity, origin,
observation interval, active tester count, station mix, public requests,
429 responses and upstream call counts/statuses by operation. Use available
Netlify traffic/function logs and TfL portal usage. Keep credentials and full
credential-bearing upstream URLs out of logs and release evidence. Observe
usage over repeated polls, startup and manual bursts, and shared Wi-Fi sessions.
Compare observed aggregate usage with the actual key entitlement before
expanding the group.

If quota exhaustion or unexpected upstream 429s occur, pause the affected
beta testing and repeated manual retries, capture non-secret timings/statuses
and portal usage, and wait for the provider's allowance recovery. Verify a
small successful request after recovery before resuming the group. Review
tester concurrency and feed mix, and adjust the two policy values through a
reviewed configuration change if needed. A hard global quota requirement needs
an explicitly authorized architecture decision. Keep credentials server-only.

## Deployment acceptance checklist

Keep NB-28 open until the following evidence is recorded after account recovery.

- [ ] Record actual TfL entitlement, tester group, deploy identity, origin and date.
- [ ] Inspect Netlify post-processing logs and capture successful validation of
  exactly two rate-limit rules, their path patterns, values and rewrite target.
  Invalid rules may leave a deploy successful, so a green build alone is insufficient.
- [ ] Confirm allowed canonical and trailing-slash GET requests reach both live
  handlers unchanged, with valid query parameters.
- [ ] Discover adapter-generated/internal function URLs and any alternate public
  paths that can reach either handler. Probe encoded/normalized path variants
  and ensure each equivalent entry point traverses enforcement. Resolve any
  publicly reachable bypass before release.
- [ ] Trigger each endpoint rule under controlled traffic, allowing the documented
  10-second enforcement lag. Confirm canonical and slash variants both receive
  429 and share the intended endpoint rule, with independent endpoint counters.
- [ ] Capture status, exact shared JSON, `Retry-After: 30`, JSON content type and
  `Cache-Control: no-store`. Call the fallback directly to confirm the contract
  and absence of a rewrite loop.
- [ ] Correlate denied requests with upstream tracing and demonstrate that denied
  requests start no arrivals, topology or timetable work after enforcement begins.
- [ ] Verify retry recovery after the window/deadline, including native three-card
  sharing, app resume, shared Wi-Fi and successful refreshing of retained data.
- [ ] Record observed request-to-feed fan-out and aggregate TfL usage against the
  confirmed allowance. Preserve raw non-secret evidence with release verification.

[Netlify post-processing and enforcement guidance](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)
