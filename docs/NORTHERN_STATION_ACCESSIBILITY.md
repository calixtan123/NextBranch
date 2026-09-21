# Northern station-accessibility data spike

## Decision

Do not add a station-accessibility card from this export. The identifier join is
complete, but the evidence gate fails on freshness and scope. The app must not
turn these records into a route, live lift status, whole-journey step-free
status, or accessibility confidence claim.

This is a data-quality decision, not a claim that the stations are inaccessible.
Missing values remain unknown.

## Dataset inspected

The local, git-ignored `tfl-stationdata-detailed` directory was inspected on 21
September 2026. It contains `FeedInfo.csv`, `Stations.csv`, `Platforms.csv`,
`PlatformServices.csv`, `Lifts.csv`, `Toilets.csv`, `StationPoints.csv`,
`RampRoutes.csv`, `SameLevelPaths.csv`, `StepFreeIntechangeInfo.csv`, and
`ModesAndLines.csv`. The spelling `StepFreeIntechangeInfo.csv` is the source
filename.

The repeatable audit consumes the six files needed for the evidence decision:
feed metadata, stations, platforms, platform services, lifts, and toilets. The
other files' schemas were reviewed but are not interpreted as a route graph.
Doing so would expand this spike into step-free routing, which is explicitly out
of scope.

`FeedInfo.csv` identifies Transport for London, links to `https://tfl.gov.uk`,
uses English, and supplies `FeedStartDate` as `2026-08-03T09:14+00:00`.
Publisher attribution and the timestamp syntax are valid. However, the export
does not provide an explicit last-updated timestamp, feed version, feed end
date, download identifier, or refresh cadence. `FeedStartDate` is therefore
recorded under its source name and is not relabelled as “last updated” or used
to assert that the facts are current.

The generated artifact normalizes that valid timestamp to
`2026-08-03T09:14:00.000Z`. Its metadata boundary accepts only the exact TfL
publisher name, English language code, a strict timestamp, and an HTTPS TfL
publisher origin with no username, password, port, path, query, or fragment.
Anything else becomes the fixed value `Unknown` plus a fixed issue code; the
source text is not copied. Unexpected or malformed station identifiers are
reported as counts, never echoed into the artifact.

## Findings

The join path is:

```text
PlatformServices.StopAreaNaptanCode (canonical app ID)
  → PlatformServices.PlatformUniqueId
  → Platforms.UniqueId / Platforms.StationUniqueId
  → Stations.UniqueId
```

The actual export contains 52 Northern service station IDs, matching all 52
canonical app IDs. All 120 Northern platform-service rows join to a platform
and station, no source station maps to multiple canonical IDs, and the audit
found no conflicting duplicate Northern platform-service records. This makes
the identifier relationship trustworthy for analysis, but it does not make
every accessibility field complete or current.

The audit also checks every `Platforms.csv` record sharing a platform ID before
establishing station ownership. Identical ownership duplicates do not change
the join. Conflicting station identifiers produce a fixed contradiction type,
increment the ambiguous-platform count, make the join unreliable, and exclude
that platform from station/facility attribution. This interpretation is
independent of CSV row order.

Important null patterns in the sanitized report include:

- `AverageGap` and `AverageStep`: absent in 119 of 120 Northern platform-service rows.
- `MinGap`, `MaxGap`, `MinStep`, and `MaxStep`: each absent in 70 of 120 rows.
- `LocationOfLevelAccess`: absent in 106 of 120 rows.
- `AdditionalAccessibilityInformation`: absent in 113 of 120 rows.
- `AccessibleEntranceName`: absent in 116 of 120 Northern platform rows.
- `BlueBadgeCarParkSpaces`: absent in 49 of 52 Northern station rows.
- Toilet `OpeningHours`: absent in all 32 Northern station-complex toilet rows.

Blank fields are counted as nulls, not converted to `false`, “no”, or any other
accessibility conclusion. The audit's contradiction check compares duplicate
Northern platform-service records on canonical identity, gap/step measurements,
designated level-access flags, locations, and manual-ramp flags. No such
contradictions were present in this export.

Lift and toilet rows use `StationUniqueId`. At interchanges that identifier can
describe the whole station complex (`HUB…`), not a particular Northern platform
or route. The export therefore cannot support a safe claim that a hub-level
lift or toilet serves the selected Northern journey. It also contains no live
lift-availability evidence.

## Display evidence gate

The gate outcome is **fail**, so no facts module or UI card was added.

Facts trustworthy enough to retain in the audit are limited to source
attribution, the source-labelled feed start date with its limitation, join
coverage, null counts, and contradiction counts. No end-user accessibility
fact is approved for display from this snapshot.

The following claims remain prohibited:

- live lift availability;
- whole-journey step-free status;
- a step-free route; and
- an accessibility confidence level.

A future reconsideration needs independently documented provenance with a real
last-updated/version contract and a reviewed rule that ties ancillary records
to the relevant Northern platform or explicitly labels them as station-complex
facts. That would be a new scoped task, not an automatic consequence of
refreshing this report.

## Repeat the audit

Supply the dataset directory explicitly. Do not copy the ignored source export
into the repository.

```bash
node scripts/analyze-northern-station-accessibility.mjs \
  /absolute/path/to/tfl-stationdata-detailed \
  data/northern-station-accessibility-report.json
```

The command fails when a required file or column is absent. Its output is
Northern-only and excludes raw free-text notes, non-Northern records, input
paths, credentials, URL paths/queries/fragments, malformed identifiers, and
location data. Review the generated diff before
committing because a successful command does not change the evidence-gate
decision automatically.
