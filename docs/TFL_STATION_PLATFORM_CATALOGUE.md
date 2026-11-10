# TfL station and platform catalogue

Reference snapshot retrieved on 10 November 2026. The source archive's embedded file dates are 20 October 2026. This catalogue supplies station identities, physical-platform descriptions and the lines serving each platform for the station-search integration task.

App integration is tracked in [NB-4](https://synapse21.atlassian.net/browse/NB-4), covering station search, platform direction descriptions, shared-line platforms and verified live-arrival mappings. It coordinates with the native UI work in [NB-3](https://synapse21.atlassian.net/browse/NB-3).

## Files

The snapshot is stored in [`data/tfl-station-platform-inventory/`](../data/tfl-station-platform-inventory/).

| File | Representation |
| --- | --- |
| [`tfl-station-platform-lines.json`](../data/tfl-station-platform-inventory/tfl-station-platform-lines.json) | Stations containing platforms containing service relationships, with provenance metadata |
| [`tfl-station-platform-lines.csv`](../data/tfl-station-platform-inventory/tfl-station-platform-lines.csv) | One row per platform-service relationship, encoded as UTF-8 with a byte-order mark |
| [`tfl-station-platform-lines.xlsx`](../data/tfl-station-platform-inventory/tfl-station-platform-lines.xlsx) | Review workbook with Platforms, Platform services and Stations sheets |

The complete extraction has **509 station records, 1,584 platforms and 1,878 platform-service relationships**. JSON preserves stations and platforms even when they have no service relationships. Consumers should use the nested JSON for the complete hierarchy.

## Official sources and provenance

TfL publishes the detailed station topology and defines the station, platform and service relationships in its specification. The archive is the primary source for this snapshot. [Detailed archive](https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip), [TfL data catalogue](https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3668), [schema specification](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf).

The downloaded ZIP's SHA-256 checksum is `9107a1ed212bcc1fe9ae6b89dc9ad0dc40b14295271983c14272ba7763c6d2df`. The same value and source dates are recorded in JSON metadata. Use the source download and its checksum to reproduce or audit the snapshot. Follow the transport-data terms linked from TfL's catalogue when distributing derived data. [TfL data catalogue](https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3668).

The extraction joins the published tables as follows.

```text
Stations.UniqueId = Platforms.StationUniqueId
Platforms.UniqueId = PlatformServices.PlatformUniqueId
```

## Fields for application integration

| JSON field | Published source or derivation |
| --- | --- |
| `station_id`, `station_name` | `Stations.UniqueId`, `Stations.Name` |
| `fare_zones`, `hub_naptan_code` | `Stations.FareZones`, `Stations.HubNaptanCode` |
| `platform_id` | `Platforms.UniqueId`, preserved verbatim |
| `platform_number` | `Platforms.PlatformNumber`, preserved as text |
| `friendly_name` | `Platforms.FriendlyName` |
| `cardinal_direction` | `Platforms.CardinalDirection` |
| `platform_naptan_code` | `Platforms.PlatformNaptanCode` |
| `is_customer_facing` | Boolean conversion of `Platforms.IsCustomerFacing` |
| `services[].line_id` | `PlatformServices.Line` |
| `services[].line_name` | Human-readable display name mapped from the published line ID |
| `services[].mode` | Mode from `ModesAndLines.csv` for that line ID |
| `services[].direction_towards` | `PlatformServices.DirectionTowards` |
| `services[].stop_area_naptan_code` | `PlatformServices.StopAreaNaptanCode` |

A service row represents one line serving one platform. Keep all rows for shared platforms. For example, both Kew Gardens platforms serve District and Mildmay. Lines must come from `services[].line_id`, because historic names remain embedded in some platform IDs. [Schema specification](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf).

## Coverage and interpretation

The snapshot includes all 11 Underground lines, DLR, Elizabeth line, Tram and the six named London Overground lines. Those 20 rail and tram lines account for 458 station records, 1,239 platforms and 1,404 service rows. The retained extraction additionally includes 472 National Rail service rows and two cable-car service rows. These figures describe this source snapshot's coverage. TfL's specification describes partial Thameslink coverage, and this archive has no `thameslink` platform-service rows. The catalogue also describes river coverage, which does not establish a complete river-platform inventory in these tables. [TfL data catalogue](https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3668), [schema specification](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf).

Apply the following rules when integrating this snapshot.

- Use `friendly_name` and the separately stored `cardinal_direction` for platform descriptions. Preserve eastbound, westbound and other published directions alongside northbound and southbound.
- Preserve blank values as unknown. Seventy platforms have blank platform numbers. Destination or branch wording can also be absent. A line name, branch or train destination cannot establish a physical platform number.
- Six platform records are marked non-customer-facing. Retain them in the reference data and exclude them from passenger selection.
- Use `platform_id` as the stable identity inside this snapshot. Some `station_id` values identify hubs, while each service supplies its own stop-area ID for API requests. Kew Gardens, for example, has separate Underground and Overground stop-area IDs beneath one station.
- Validate platform NaPTAN mappings before matching arrivals. The source gives Colindale platforms 1 and 2 the same `platform_naptan_code`. Resolve this ambiguity with additional official evidence or use a documented unambiguous mapping, and keep unresolved predictions unassigned.
- Treat `direction_towards` as published service wording. Camden Town's southbound platforms have blank values in this snapshot, so Bank or Charing Cross branch labels need additional evidence.
- This snapshot models customer-facing topology and accessibility infrastructure. Live allocations, disruptions and arrival availability need their own handling. Broader National Rail coverage is partial. [Schema specification](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf).

## Verification

Validation compares every extracted station and platform field with its source CSV row, verifies unique station/platform IDs and valid joins, and compares the complete multiset of service relationships with `PlatformServices.csv`. It also checks the CSV against the nested JSON and checks the XLSX ZIP/XML structure and worksheet row counts. Snapshot counts, blank platform numbers, customer-facing flags and the Kew Gardens shared-line example are checked explicitly.

Refresh by downloading the official archive, reviewing its schema and scope, repeating the station/platform/service joins, and replacing the three representations together after the same checks. Record the new dates, counts and source checksum with the refreshed snapshot.

## NB-5 foundation and passenger catalogue

`src/lib/catalogue` validates the entire snapshot with the application's installed Zod dependency before deriving the passenger catalogue. The validation boundary rejects malformed values, duplicate station/platform IDs, duplicate service relationships, unknown or inconsistent line references, incorrect provenance and disagreeing metadata counts. The refresh command additionally checks both source joins before constructing the nested JSON. Empty source strings retain their published meaning.

The bundled version is identified by its source date and archive SHA-256 in `metadata`. Source totals and derived passenger totals are separate.

| Representation | Stations | Physical platforms | Service relationships |
| --- | ---: | ---: | ---: |
| Complete published extraction | 509 | 1,584 | 1,878 |
| Customer-facing platforms with an in-scope TfL service | 460 | 1,235 | 1,528 |

The app subset includes the 20 rail/tram lines and retained London Cable Car. It excludes all six non-customer-facing platforms and National Rail-only platforms. Its service total includes every published service on retained shared TfL/National Rail platforms. For example, Amersham retains Metropolitan and National Rail relationships on each eligible shared physical platform. Kew Gardens retains two physical platforms, each with District and Mildmay services and their separate stop-area IDs.

`createCatalogue` provides canonical station, physical-platform and service-stop-area indexes. `stationsByAnyId` adds only unambiguous service stop-area aliases, preserving existing Northern IDs such as `940GZZLUEUS` alongside canonical `HUBEUS`. `searchCatalogue` uses the existing punctuation/case normalization and reviewed Northern aliases, orders prefix matches before contained matches, and resolves ties by canonical name and ID. It returns explicit `empty-query`, `no-match` and `missing-catalogue` states. Empty queries return the complete sorted passenger station list. All these operations work from the bundled snapshot without a network request.

Published platform number, friendly description, cardinal direction and service wording remain independent fields. An empty string remains unknown. Consumers can display “Direction unavailable” for a blank direction. The API leaves Camden Town's blank southbound `direction_towards` fields empty.

## Northern departures compatibility and mapping evidence

`/api/departures?station=<id>` accepts a canonical passenger station ID or an unambiguous service stop-area alias. Northern hubs resolve to their published Northern service stop area for the existing server-only Northern transport. The response retains the requested `station.id`, legacy station names for existing Northern IDs, existing platform labels/directions, response status/error codes, refresh policy, freshness handling and prediction ordering. Journey, branch, confidence, credential and rate-limit logic remains owned by the existing Northern modules.

The additive `catalogue` object contains the canonical station ID, all eligible physical-platform descriptions, all retained services and service-level `feed` and `mapping` capabilities. Each capability is `supported`, `unsupported` or `unverified`. Supported Northern groups also include `physicalPlatformId`, with `null` for unassigned predictions. Departures retain `lineId`. The shared response decoder preserves these optional additions and continues accepting older responses.

Northern physical matching requires the existing normalizer's exact live label, such as `Northbound - Platform 1`, plus exactly one catalogue platform with that published number, cardinal direction and Northern service. Direction-only, number-only, contradictory and ambiguous records retain a null physical-platform assignment. Destination, branch wording, historical platform-ID text and platform NaPTAN are never matching inputs.

Colindale's official `Platforms.csv` establishes the following distinct pairs in the checksum-pinned archive. The duplicated NaPTAN has no role in matching.

| Canonical physical platform | Published number | Published direction |
| --- | --- | --- |
| `940GZZLUCND-Plat01-NB-northern` | 1 | Northbound |
| `940GZZLUCND-Plat02-SB-northern` | 2 | Southbound |

The unambiguous number-and-cardinal pair is the mapping evidence. The original duplicated NaPTAN remains preserved in source and API metadata. Camden Town likewise matches the published 1/3 Northbound and 2/4 Southbound pairs without manufacturing a Bank or Charing Cross platform branch. Temporary allocations with a contradictory label remain unassigned. [Official archive](https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip), [field specification](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf).

Only the existing Northern arrivals transport is implemented in NB-5. Other in-scope line feeds and mappings are `unverified` pending their mode-specific evidence and implementation. National Rail live integration is `unsupported` for this delivery. Catalogue-only stations return their platform metadata with `liveState: "unverified"` and make no upstream request. A supported Northern feed separately reports `available`, successful `empty`, or transient `unavailable`. Upstream/configuration failures retain their 503/500 status and established error code, with additive catalogue capability metadata. Feed capability therefore survives an empty snapshot or outage.

Native search/picker/save integration remains gated on NB-3 acceptance and merge. NB-5 verification covers the reusable catalogue and normal server API boundary. The parent NB-4 delivery owns the later native search-to-save walkthrough and remaining live modes.

## NB-8 Underground departures and reviewed platform coverage

The server now fetches the exact line and service stop-area pair for all eleven Underground lines. `getArrivals` remains the Northern wrapper used by journey callers. Concurrent arrivals requests share work only when both line ID and stop area agree. A request with its own cancellation signal remains isolated from shared requests. Canonical hubs resolve through each published service relationship, including multiple lines at Euston and separate District/Mildmay stop areas at Kew Gardens.

Official TfL line-arrivals responses were captured on 10 November 2026. `data/tfl-underground-evidence.json` retains the source URL, original response SHA-256, prediction count and distinct observed line/stop-area/platform labels for every line. These captures establish supported feed capability. A physical service/platform mapping additionally requires an observed explicit cardinal direction and platform number matching exactly one published platform for the same service stop area and line. Previously reviewed Northern mappings remain supported. Platform NaPTANs, destination names and branch wording play no role in this match. Labels such as “Inner Rail”, conflicting directions or number-only descriptions remain unconfirmed.

| Line | Predictions in capture | Distinct observed labels |
| --- | ---: | ---: |
| Bakerloo | 217 | 48 |
| Central | 606 | 98 |
| Circle | 143 | 48 |
| District | 445 | 107 |
| Hammersmith & City | 276 | 77 |
| Jubilee | 419 | 53 |
| Metropolitan | 258 | 74 |
| Northern | 966 | 108 |
| Piccadilly | 633 | 110 |
| Victoria | 272 | 33 |
| Waterloo & City | 4 | 3 |

A capture reflects trains present at that observation time. Underground platforms absent from reviewed evidence remain discoverable with matching awaiting verification. New labels require a fresh official capture and review against the station archive before enabling the mapping. Refreshing the station archive alone does not establish new live capability. The original raw capture files were temporary verification inputs, while their hashes and reviewed distinct labels are retained in the evidence bundle.

Non-Northern normalization retains Northbound, Southbound, Eastbound and Westbound, exact line identity, stop area and feed-scoped prediction IDs. Existing Northern normalization, journey branch handling, freshness and confidence rules are reused. The server and native decoders retain these directions and line IDs. Canonical boards use `physicalPlatformId` to prevent same-number trains from another physical platform leaking onto a selected board.

The additive `catalogue.feeds` array reports `available`, successful `empty` or temporary `unavailable` per line/stop pair. Aggregate `liveState` becomes `partial` when one feed fails while another succeeds. All-feed failures retain the existing 500 configuration or 503 upstream response. Static feed/mapping capabilities survive outages and empty snapshots, so a supported verified platform can still be saved. Boards distinguish temporary supported-feed failure, successful empty feeds, unsupported National Rail coverage and services awaiting verification. Other TfL modes remain unverified in this task, including Mildmay at Kew Gardens. Combining and validating those remaining shared-mode feeds belongs to subsequent tasks.

Automated native screen walkthroughs execute Search → Picker → Departures → Save → persisted reload → Home → reopened Departures with representative reviewed platforms for all eleven lines, each during an outage and successful empty snapshot. The walkthroughs cover Baker Street, Bank, Aldgate, Acton Town, Aldgate East, Colindale and Blackhorse Road. They exercise actual screen callbacks with mocked native view boundaries. They establish navigation/save behavior in tests. Simulator and physical-device visual/interaction sign-off remain outstanding.

## Repeatable validated refresh

Use Node 24, the installed application dependencies from `npm ci`, and Python 3.12 or newer. Download the official archive to a local path and review its SHA-256 and source changes. Pass the reviewed checksum and actual retrieval date explicitly. The command performs the full extraction and regenerates all three review formats.

```bash
curl --fail --location 'https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip' --output /tmp/tfl-stationdata-detailed.zip
shasum -a 256 /tmp/tfl-stationdata-detailed.zip
npm run refresh:catalogue -- \
  --archive /tmp/tfl-stationdata-detailed.zip \
  --sha256 <reviewed-sha256> \
  --retrieved-on YYYY-MM-DD
```

For this reference version, the reviewed SHA-256 is `9107a1ed212bcc1fe9ae6b89dc9ad0dc40b14295271983c14272ba7763c6d2df` and retrieval date is `2026-11-10`. The refresh takes its source version date from `FeedInfo.csv`. Preserve the downloaded archive for source-level auditing. `--output <directory>` supports a disposable verification bundle. The output directory must be dedicated to these three files.

The refresh uses standard-library CSV, ZIP and XML processing, and invokes the same Zod validation boundary as application loading. It rejects broken source joins, duplicate IDs, unknown lines/modes, malformed source rows, invalid booleans and checksum mismatches. JSON is staged and validated first. CSV is compared cell-for-cell with the derived JSON service rows. All three XLSX worksheets are reopened and compared cell-for-cell with their expected JSON views, preserving blanks and text-safe identifiers. The generated review workbook has filterable headers and frozen header rows across Platforms, Platform services and Stations.

A sibling exclusive lock serializes refresh writers. The complete validated directory is published using directory renames, with the prior directory restored if publication fails. Readers can briefly encounter a missing directory between the two renames. Run refresh in a maintenance/development context, then rebuild/redeploy the app, whose catalogue is bundled at build time. A process kill or power loss can leave `.<directory-name>.refresh.lock` and `.<directory-name>.previous` beside the output. After confirming the refresh process has ended, inspect the current bundle and backup. Restore the `.previous` directory if the destination is absent, then remove the stale lock. The command preserves an interrupted backup and refuses to overwrite it. These checks provide rollback for ordinary errors. The two renames do not form a crash-atomic filesystem transaction.

After refresh, review the JSON/CSV/XLSX diff together. Update the documented full/app counts, source date and checksum if they changed, and review mapping evidence before enabling new live capability.

```bash
npm test -- src/lib/catalogue src/app/api/departures/route.test.ts src/lib/departure-view.test.ts
python3 -m pytest -q tests/catalogue
npm run verify
npm run build
```

Pytest uses Arrange / Act / Assert. Each test prepares a small official-schema archive, runs the extraction or refresh operation, and checks exported values or safe failure behavior. The suite covers shared services and blanks, malformed tables, broken joins, duplicate IDs, unknown lines, checksum and writer-lock rejection, validation before publication, rollback, retained recovery backups and repeat refreshes. The existing Verify CI workflow runs these tests alongside the TypeScript suite.
