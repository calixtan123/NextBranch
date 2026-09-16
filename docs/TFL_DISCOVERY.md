# TfL discovery

The capture date is 15 September 2026. It is one snapshot, not a longitudinal
study. The named sample stations are Camden Town, Euston, Kennington, Stockwell,
East Finchley, High Barnet, and Moorgate. The optional reproduction tool is
`node scripts/tfl-discovery.mjs`; live use requires `TFL_API_KEY` and fixture
use requires an explicit `--fixture path`.

| Original question | Conclusion | Evidence / sample size | Counterexamples | Confidence | Implementation consequence | Unresolved risk |
| --- | --- | --- | --- | --- | --- | --- |
| Are vehicle IDs consistent enough for downstream matching? | Useful only as one part of a unique match. | Arrival fields from 7 named stations; one capture, with vehicle/timestamp/terminus/branch fields where present. | Missing or reused IDs; no longitudinal evidence. | Low | Require vehicle ID, timestamp, line, terminus, branch compatibility, one match, and timetable runtime. | Stability across a service day and disruptions is unknown. |
| Do platform fields identify a platform? | Only the exact `Northbound - Platform <token>` / southbound form confirms it. | Camden sample includes `Northbound - Platform 3`; direction-only records also occur. | `Platform 2` without direction and malformed wording. | High | Preserve direction-only as “platform unconfirmed”; never infer a number. | TfL wording may change. |
| Can branches be distinguished? | Ordered route IDs distinguish Bank and Charing Cross. | `/Line/northern/Route/Sequence/all` has 16 ordered route patterns in the bundled capture; `towards` supplies observed via hints. | Battersea names can omit a clear `via`; contradictory hints and disruption routes exist. | High for topology, medium for live hints | Use route station IDs, normalize only observed hints, and withhold branch conflicts. | Exceptional patterns may not appear in the bundled snapshot. |
| Is a downstream snapshot available for live ETA? | Sometimes, but absence/non-uniqueness is normal. | 7 station samples and vehicle grouping; no longitudinal coverage claim. | Vehicle absent downstream, duplicate matches, stale timestamp, or branch conflict. | Low | Use a live ETA only for one compatible downstream match within 90 seconds; otherwise estimate/unavailable. | Station timing and API sample skew vary. |
| What terminating/unusual patterns occur? | High Barnet, Edgware, Mill Hill East, Morden, Battersea Power Station, and Kennington short turns must be represented. | Route sequence count: 16; route first/last station IDs plus advertised destination fields; timetable sample includes service-day schedules. | Unknown/short-turn terminus, empty topology, or service exceptions. | Medium | Slice only at a recognized advertised terminus; use fresh fallback topology or 503 for unusable topology. | One capture cannot cover engineering and special services. |

## 1. Credential and endpoints

Conclusion: use an `app_key` only. The endpoints sampled were
`/Line/northern/Arrivals/{station}`, `/Line/northern/Route/Sequence/all`, and
`/Line/northern/Timetable/{from}/to/{to}`. No obsolete `app_id` appeared.
Arrivals are requested `no-store`; route and timetable are cached for 43,200
seconds by Next. The tool records observed `Cache-Control` headers when the
upstream provides them, without printing the key. `TFL_API_KEY` remains
server-only. Risk: credentials, terms, and headers can change.

The retained capture's observed cache policy was arrivals `no-store` and route /
timetable `revalidate=43,200 seconds`; an upstream literal `Cache-Control` value
was not preserved separately from that request policy.

## 2. Direct-journey proof

Conclusion: only an ordered official route with destination after origin proves a
direct pair. Evidence: 16 ordered patterns in captured inbound/outbound topology.
Counterexample: station branch labels do not prove a train stopping pattern.
Confidence: high. Consequence: candidates must agree or are withheld. Risk: fallback
topology is deliberately limited to 30 days.

## 3. Platform text

Conclusion: confirmation requires `Northbound|Southbound - Platform <token>`.
Evidence: Camden includes `Northbound - Platform 3`; direction-only records occur.
Counterexample: `Platform 2` does not prove a direction. Confidence: high.
Consequence: never invent a platform number. Risk: TfL wording may change.

## 4. Vehicle identity

Conclusion: one snapshot supports matching but cannot establish temporal vehicle-ID
stability. Evidence: Camden, Euston, Kennington, Stockwell, East Finchley, High
Barnet, Moorgate and aggregate samples contain IDs. Counterexample: no longitudinal
sample. Confidence: low. Consequence: live matching requires vehicle, terminus,
branch, line, timestamp, uniqueness and runtime checks. Risk: IDs may be reused.

## 5. Timetable runtime

Conclusion: `StationInterval.timeToArrival` is cumulative minutes. Evidence:
the Camden-to-Edgware fixture has `22`, and adding 22 minutes gives the observed
fixture ETA; treating it as seconds is implausible. Schedules can have multiple
compatible journeys, so the implementation selects exactly one Europe/London
service-local journey within 30 minutes. Confidence: medium. Risk: exception
days and timetable schema changes need more captures.

## Limitations

The sample is one snapshot on 15 September 2026. It cannot prove vehicle-ID
stability, all platform wording, all branch exceptions, or availability during
disruption. Discovery output is intentionally sanitized to the fields used by
the application and must not be treated as live verification.
