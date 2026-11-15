# TestFlight request protection

## Status and release boundary

NB-43 requires an explicit production protection acknowledgement. NB-28 owns
operational enforcement acceptance, and NB-29 owns hosting connectivity.
Repository tests cover the application boundary, host declarations, path matching
and retry behavior. The owner manages deployment within the £0 beta budget.

A read-only inspection on 15 November 2026 found Vercel project
`calixtan-9855/next-branch` on Hobby serving `89d7362` at
`https://next-branch.vercel.app`. Firewall overview and rules showed zero custom
rules and no enforced rules. Invalid canonical requests returned 400 with
`INVALID_STATION` / `INVALID_JOURNEY`, and trailing slashes returned 308.
Safe signed-out smoke checks also returned 200 JSON with `Cache-Control: no-store`
for Camden Town departures at 12:57:31 UTC and the Camden Town to Edgware journey
at 12:57:51 UTC. An observed generated deployment alias redirected an invalid
departures request to Vercel SSO with HTTP 302 and no-store at 12:58:22 UTC.
That alias required authentication in the observed check. No burst was performed
because custom rules were absent. Other aliases and denial/recovery behavior
remain unverified. These observations leave effective protection acceptance pending. No rule,
environment setting or deployment was changed during that inspection.

The TfL public product page lists 50 requests/minute for anonymous access and
500 requests/minute for subscribed access. The portal was signed out, so the
production key's actual product and entitlement remain unverified. The intended
tester group also needs to be recorded. [TfL API products](https://api-portal.tfl.gov.uk/products)

## Production configuration and failure policy

Set the server-only `NEXTBRANCH_API_PROTECTION` environment variable to the exact
value `vercel-waf` for the shared Vercel rule described in the Vercel runbook, or
`netlify-edge` for both deployed Netlify rules below. Set it separately in every
deployed environment whose Next.js runtime has `NODE_ENV=production`, including
live previews, and redeploy the affected environment after changing it.
Development and test runtimes remain usable without the setting.

Before acknowledging a host arrangement, the owner must verify its published
rules, scope, public entry points, safe invalid-query denials, upstream
suppression and eventual recovery using the host checklists. During initial
verification, leave the acknowledgement unset. An allowed request reaching the
candidate returns no-store 503 with `PROTECTION_UNAVAILABLE`, which serves as a
positive control for function invocation without TfL work. Host-denied requests
must still return 429. After host checks pass, set the matching value, redeploy,
and repeat the canonical, slash and alias checks, including normal live traffic.
[Vercel bootstrap and acceptance checks](TESTFLIGHT_VERCEL.md)

This is an operator acknowledgement of an external trust boundary. The
application validates the setting but cannot inspect or monitor the actual host
rule. A correctly spelled value continues admitting requests if an operator later
removes the rule or exposes a bypass. Re-verify after changes to host rules,
aliases, rewrites, deployment protection or hosting provider. Public request
headers, including host-looking headers, never establish protection.

The availability tradeoff is deliberate. Missing or unsupported production
configuration returns a controlled no-store 503 before validation or any arrivals,
topology or timetable work. An injected server-side `RateLimitAdapter` remains
supported. A thrown/rejected provider call or missing/malformed decision receives
the same 503. Explicit denial keeps HTTP 429 and `Retry-After: 30`. Successful
later checks admit requests again. No credentials or provider error details are
returned. Host-generated 429 responses may have empty or non-JSON bodies, which
both clients handle with a retry fallback.

## Selected provisional Netlify policy

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
at Liverpool Street and Paddington. Each departures response reads its
supported feeds once. NB-42 shares in-flight work and caches validated successful
feeds for 10 seconds, bounded to 256 exact line/stop pairs per runtime. Sequential
requests inside that TTL can reuse upstream results. Normal 30-second polls can
miss the cache, and separate instances/regions have independent caches.

Without cache reuse, one client polling three worst-case stations can cause 42
arrival calls/minute, five such clients can cause 210, and 60 admitted departures
requests can cause 420 per endpoint/domain/IP window. These arithmetic bounds
exclude enforcement-lag traffic, additional domains/IPs and other TfL operations.
A host per-IP request limit and a process-local cache provide no hard key-wide
ceiling across clients, operations, instances or regions. A shared atomic upstream
accounting design requires an explicit owner decision if a hard ceiling becomes
required. No paid infrastructure is part of this change.

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
host traffic/function logs and TfL portal usage. Keep credentials and full
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

Keep NB-28 operational acceptance open until the following evidence is recorded
for the deployed host. The checklist below covers Netlify after account recovery.
Use the Vercel runbook for the current Vercel candidate.

- [ ] Record actual TfL entitlement, tester group, deploy identity, origin and date.
- [ ] Leave `NEXTBRANCH_API_PROTECTION` unset while proving host protection using
  invalid inputs. After the host evidence passes, set `netlify-edge`, redeploy and
  record the setting name/value and deployment identity without secrets.
- [ ] Inspect Netlify post-processing logs and capture successful validation of
  exactly two rate-limit rules, their path patterns, values and rewrite target.
  Invalid rules may leave a deploy successful, so a green build alone is insufficient.
- [ ] Confirm allowed canonical and trailing-slash GET requests reach both live
  handlers unchanged, with valid query parameters.
- [ ] Discover adapter-generated/internal function URLs and any alternate public
  paths that can reach either handler. Probe encoded/normalized path variants
  and ensure each equivalent entry point traverses enforcement. Resolve any
  publicly reachable bypass before release.
- [ ] Trigger each endpoint rule with invalid queries that return before TfL, allowing the documented
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
