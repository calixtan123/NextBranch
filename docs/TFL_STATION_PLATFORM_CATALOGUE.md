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
