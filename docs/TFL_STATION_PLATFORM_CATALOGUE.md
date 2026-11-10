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

## NB-9 DLR departures and reviewed platform coverage

DLR uses the existing server-only line/stop-area transport and canonical station search. A hub such as Canary Wharf resolves to DLR service stop area `940GZZDLCAN`, independently of its Jubilee service. Exact line and stop-area filtering occurs before normalization and physical-platform matching.

Official TfL DLR responses were captured on 10 November 2026. The network response contained 266 predictions and 99 distinct line/stop-area/platform labels. The Canary Wharf station response contained 18 predictions covering all six DLR platforms. `data/tfl-dlr-evidence.json` records both source URLs, original SHA-256 hashes, counts and exact observed labels. `data/tfl-dlr-canary-wharf-fixture.json` retains the arrival-schema fields from all 18 station records with their original blanks. [Official network feed](https://api.tfl.gov.uk/Line/dlr/Arrivals), [official Canary Wharf feed](https://api.tfl.gov.uk/Line/dlr/Arrivals/940GZZDLCAN).

A DLR physical-platform match requires an observed explicit platform number and exactly one published physical platform with that number, DLR line and service stop area. Stratford's `4a`/`4b` live labels normalize to published `4A`/`4B`. Destination, inbound/outbound wording and platform-ID text have no role in matching. DLR live labels omit cardinal direction. After the physical match, the API displays that platform's published cardinal direction where present. Canary Wharf platforms 3 and 4 retain null live-board direction and blank published direction/towards fields.

| DLR service/platform coverage | Count |
| --- | ---: |
| Published eligible DLR relationships | 101 |
| Supported feed and reviewed unique mapping | 99 |
| Supported feed with mapping awaiting verification | 2 |

Lewisham platform 5 and Tower Gateway platform 1 were absent from the reviewed captures. They remain inspectable with matching-awaiting-verification explanations and Save unavailable. Newly observed labels require review against the station archive before enabling these mappings. A successful empty snapshot or temporary failure preserves the static supported mapping and Save eligibility for the 99 verified relationships.

TfL reused one upstream prediction ID across Canary Wharf's 18 records. DLR normalization therefore uses the existing composite identity helper, scoped by line and service stop area, to retain distinct arrival-time/platform predictions and remove identical repeated copies. The fixture regression verifies 18 distinct departures in six physical groups and three rows for the selected unknown-direction platform.

Automated native screen walkthroughs exercise Canary Wharf platforms 3/4 and Stratford 4A/4B through Search → Picker → Departures → Save → persisted reload → Home → reopened Departures during available, successful empty and outage snapshots. Separate rendered-board checks preserve blank direction/towards wording and distinguish temporary failure from empty departures. These tests mock native view boundaries. Simulator/device appearance, gestures and native accessibility remain separate acceptance work.

## NB-10 London Overground departures and reviewed platform coverage

The existing server-only rail transport now supports Liberty, Lioness, Mildmay, Suffragette, Weaver and Windrush using their current service line IDs. Each request resolves the canonical station to the exact published service stop area. Examples include Euston → `lioness` / `910GEUSTON`, Liverpool Street → `weaver` / `910GLIVST`, and Kew Gardens → separate District `940GZZLUKWG` and Mildmay `910GKEWGRDN` feeds. Historical `london-overground` text remains in physical-platform IDs and never establishes line membership.

Official network and representative station endpoint responses were captured on 10 November 2026. `data/tfl-overground-evidence.json` retains the URLs, original response SHA-256 hashes, prediction counts and distinct exact labels. `data/tfl-overground-fixtures.json` preserves all arrival-schema fields for the 82 network-capture records at six representative service stops, including source blanks and unknown labels. The fixture's frozen clock is `2026-11-10T19:27:00Z`.

| Current line | Captured predictions | Distinct live labels | Published platform/service relationships | Verified relationships |
| --- | ---: | ---: | ---: | ---: |
| Liberty | 25 | 3 | 4 | 2 |
| Lioness | 311 | 56 | 41 | 33 |
| Mildmay | 869 | 87 | 58 | 56 |
| Suffragette | 36 | 13 | 26 | 8 |
| Weaver | 381 | 77 | 57 | 54 |
| Windrush | 1,054 | 75 | 59 | 57 |
| Total | 2,676 | 311 | 245 | 210 |

A verified match requires an explicit numeric or single-letter live platform label, an exact current line and service stop area, and exactly one eligible physical platform with that published number for that service. Windrush New Cross platform `D` is supported. Unknown labels, wrong lines, wrong stop areas, historical line IDs and ambiguous numbers remain unassigned. Live cardinal direction stays unknown until the physical match, after which the API uses the catalogue's published direction. Destinations and API inbound/outbound wording never supply physical identity.

All six line feeds are supported. Thirty-five platform/service relationships remain mapping-unverified and browsable. These include both Emerson Park physical records, which share Liberty platform number 1 despite different published directions. They cannot be distinguished from the observed number-only live label. Other gaps include Suffragette platforms absent from the reviewed capture, Bushey 1/2 and Watford Junction 1–4, Euston 10, Richmond 3, Willesden Junction 2, Chingford 3, Liverpool Street 4/5 and Norwood Junction 3/6. Published stop-area mismatches stay explicit and require additional official evidence before any alias can enable matching.

Shared physical platforms retain all published services and descriptions once. Kew Gardens 1/2 permit saving through verified Mildmay mapping while District mapping still awaits verification. Anerley retains Windrush and National Rail descriptions with an explicit “TfL departures only” label on its Home card and expanded board, including the Home card's accessible name. National Rail-only platforms stay excluded by the existing catalogue filter. Per-line coverage text distinguishes supported departures, successful empty feeds, temporary failure, unsupported National Rail and matching awaiting verification. Save remains available during empty snapshots or outages when at least one service has supported, verified matching.

Automated native walkthroughs exercise all six lines through Search → Picker → Departures → Save → persisted reload → Home → reopened Departures in available, successful empty and outage states. They include both Kew Gardens platforms, mixed Euston/Liverpool Street stations, shared Windrush/National Rail Anerley and New Cross `D`. Additional browse-only checks cover Emerson Park, Bushey, Watford Junction and Barking unverified platforms. The official six-line fixtures also pass through the real API handler, public native decoder and selected-platform row projection. These tests mock native view boundaries. Simulator/device appearance, gestures and VoiceOver remain separate acceptance work.

The station catalogue refresh command remains `npm run refresh:catalogue -- --archive /path/to/tfl-stationdata-detailed.zip --sha256 <reviewed-sha256> --retrieved-on YYYY-MM-DD`. Refreshing the archive preserves the full source and regenerates JSON/CSV/XLSX together after validation. Live mapping evidence has a separate review step. Capture official line and representative service-stop responses, verify their hashes and exact labels, compare each label against the new catalogue, retain ambiguous pairs as unverified, update the evidence/fixtures and rerun capability, API and native flow regressions before enabling additional mappings.

## NB-11 Elizabeth line departures and reviewed platform coverage

Elizabeth uses the shared server-only line/service-stop transport, normalizer, catalogue capability owner and canonical native flow. Official captures on 10 November 2026 include 1,482 line-wide predictions with 91 distinct exact labels and ten station responses with 431 predictions. `data/tfl-elizabeth-evidence.json` retains original URLs, retrieval timestamps, SHA-256 hashes, counts and reviewed labels. `data/tfl-elizabeth-fixtures.json` retains every arrival-schema field from all ten station responses. Each fixture uses its actual capture time as the frozen clock. [Official Elizabeth arrivals](https://api.tfl.gov.uk/Line/elizabeth/Arrivals).

| Elizabeth coverage | Count |
| --- | ---: |
| Catalogue stations with Elizabeth services | 41 |
| Eligible physical platform/service relationships | 139 |
| Supported feed relationships | 139 |
| Verified physical platform/service relationships | 80 |
| Mapping-unverified browse-only relationships | 59 |

An explicit numbered or single-letter label must match exactly one published physical platform within the exact Elizabeth service stop area. Live cardinal direction stays unknown until matching succeeds, then the board displays the published direction. Abbey Wood uses `910GABWDXR` beneath `HUBABW`, Farringdon uses `910GFRNDXR`, Paddington central platforms use `910GPADTLL`, and Liverpool Street central platforms use `910GLIVSTLL`. Current line-wide data also publishes some central services under mainline stop IDs. Targeted Paddington `910GPADTON` and Liverpool Street `910GLIVST` responses contain A/B labels, which have no corresponding published Elizabeth physical platforms at those exact service stops. These records stay unassigned. Mainline numbered platforms remain browse-only. Destination, branch, API inbound/outbound and historical IDs cannot establish a mapping.

Remaining gaps include Paddington mainline 1–5 and 8–12, Liverpool Street mainline 15–17, Heathrow Terminal 5 platform 3, Hayes & Harlington 1/2/5, Maidenhead 1/2/5 and West Drayton 1/2/5. Many intermediate stations have only their currently observed platform pair verified. All 59 unverified pairs are recorded in the NB-11 implementation report. Reading 14 and Shenfield 5/6 are verified by targeted official captures. An additional Shenfield Platform 4 live label has no eligible published Elizabeth platform and remains unassigned.

Mixed stations retain every published shared National Rail service and description. National Rail-only platforms remain excluded by passenger eligibility. The existing board and accessible Home card state TfL departure coverage and National Rail's unsupported integration. Save is enabled whenever a platform has at least one supported feed and verified physical mapping, including during successful empty snapshots and temporary outages. Wholly unverified platforms open browse details with a matching-awaiting-verification explanation.

Automated native callback walkthroughs cover Paddington A, Ealing Broadway 3, Reading 14 and Abbey Wood 4 through Search → Picker → Departures → Save → persisted reload → Home → reopened Departures in available, empty and outage conditions. Browse-only checks include Paddington 1, Liverpool Street 15, Ealing Broadway 1 and Heathrow Terminal 5 platform 3. Ten official fixture responses traverse the real server handler, native decoder and board-row projection, including unassigned mainline aliases. Compact and expanded Ealing Broadway boards retain shared service descriptions and accessible TfL coverage. Native view boundaries are mocked. Simulator/device gestures, appearance and VoiceOver require separate observations.

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

## Tram and retained cable-car capability

Official captures on 10 November 2026 establish Tram arrivals capability for all 39 retained Tram stations and 68 physical platform/service pairs. Of these pairs, 60 have reviewed unique exact service-stop, published-number and cardinal-direction matches. The other eight remain browse-only. All 67 blank Tram platform numbers stay empty strings, including on native boards and saved selections. The only published numbered Tram platform is Elmers End platform 1. Its observed `Westbound Platform` live label carries no number, so its matching remains unverified.

The Tram parser accepts the observed exact `Eastbound Platform` and `Westbound Platform` formats with an empty platform number. Numbered cardinal labels retain their explicit number. A numbered live label cannot establish membership of a blank-number physical record. East Croydon's numbered live labels, Wimbledon's numbered labels, New Addington's numbered labels and Beckenham Junction's different number/direction remain unassigned. The uncaptured westbound labels at Birkbeck and Beckenham Road remain unverified. Matching requires one unique physical candidate within the exact service stop and uses the published cardinal direction directly. Destinations, API inbound/outbound, historical ID text and branch guesses do not establish matching.

Both retained cable-car records remain searchable and inspectable with their source blank numbers. Official line metadata identifies London Cable Car. Its line-wide and both exact-stop arrivals responses were empty. These observations establish neither supported prediction capability nor confirmed unsupported capability, so both records retain unverified feed/mapping and browse-only behavior. Their details explain that live feed and physical matching await verification.

Verified Tram selections can be saved during successful empty snapshots and temporary outages. The shared static capability boundary drives native search, picker, board, Save, persisted Home cards and reopen. Unverified selections open Platform Details with the matching explanation and no Save control.

`data/tfl-tram-cable-evidence.json` retains the complete exact label sets, original URLs, receipt timestamps, SHA-256 hashes, response counts and the 70 exact retained Tram/cable-car physical projections. Its captured official ZIP is byte-identical to this inventory's source SHA-256. `data/tfl-tram-cable-fixtures.json` retains all 35 predictions from eight exact Tram captures as ordered complete schema-field projections and both cable-car empty arrays. Original responses and the projection validator remain under `/private/tmp/nb12-evidence`. The task report records capture provenance, verification commands, limits and the native callback walkthrough. Simulator/device gestures and VoiceOver were not observed in this work.
