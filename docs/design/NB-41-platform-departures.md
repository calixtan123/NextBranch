# NB-41 platform assignment and empty-board diagnosis

## Reported reproduction

The reported Acton Town District response on 14 November 2026 contains `Westbound - Platform 1` and `Eastbound - Platform 4` from the exact service endpoint. The checked-in catalogue has a unique District service relationship for each physical platform. Platform 4's static reviewed mapping capability is `unverified` because its label was absent from the finite checked-in capture. The former runtime matcher required `mapping === 'supported'`, so that valid explicit live label received `physicalPlatformId = null`. The native card selected the canonical physical ID and therefore displayed zero rows. The former unresolved counter also omitted that prediction because its platform number and direction were both populated. [District Acton Town arrivals](https://api.tfl.gov.uk/Line/district/Arrivals/940GZZLUACT)

`native/tests/server-departures-contract.test.ts` reproduces this chain with deterministic raw-shaped TfL records. Its clock is `2026-09-16T12:00:00.000Z`, its current records have source timestamp `2026-09-16T11:59:00.000Z`, and arrival time is `2026-09-16T12:02:00.000Z`. These timestamps are test inputs. The November report supplied the platform labels and endpoint. A new live response could not be retrieved during this investigation.

| Pipeline stage | Deterministic result |
| --- | --- |
| Injected District response | Seven rows including an exact duplicate, a stale prediction and a wrong-stop prediction |
| Exact line and stop filter | Six rows |
| Existing freshness and identity deduplication | Four current unique predictions |
| Physical assignment | Eastbound Platform 4 and Westbound Platform 1 each receive their unique canonical ID |
| Unresolved identities | Platform 99 and a missing label remain unassigned, count two |
| Native cards | Platform 4 shows only the eastbound prediction, Platform 1 shows only the westbound prediction |
| Static Platform 4 capability | Reviewed save eligibility remains `unverified` |

## Matching ownership

The catalogue owns published physical identities and exact line/service-stop relationships. The current record owns the explicit live platform label. Runtime assignment now requires a confirmed label and exactly one matching published platform within the record's exact supported service. Underground matching uses number and cardinal direction. DLR, Elizabeth and Overground require a unique number or letter within the exact line/stop. Tram matching preserves the published blank-number/cardinal pair. An explicit conflicting direction, ambiguous published number, missing label or mismatched service stop retains a null physical identity.

Static `serviceCapability` continues to describe reviewed capture evidence and controls new saved-platform eligibility. Runtime `physicalPlatformForTrain` can assign an explicit unique identity with a supported feed even when that platform's static evidence is unverified. This corrects the finite-capture gate without altering the station catalogue or inventing service relationships.

Native tuple fallback supports older snapshots that omit `physicalPlatformId`. An explicit null is an unresolved current identity and is excluded from tuple fallback. This prevents a known-number/direction unresolved record from appearing on a legacy card through its tuple. The unresolved count includes every current explicit null identity and retains compatibility with legacy unknown tuples.

## Historical sample traces

The additional samples below replay raw responses already checked into `data/tfl-shared-kew-fixtures.json`, `data/tfl-elizabeth-fixtures.json` and `data/tfl-tram-cable-fixtures.json`. Each sample uses its capture clock, exact line/stop filter and the production freshness/deduplication logic. Repeating every raw record produces the same normalized result. Every exact record in these captures survives the existing freshness window at its capture clock.

The count columns give raw/exact/current, assigned/unresolved and visible rows per physical platform. Visible counts use the Home/detail limits of three/five. Per-platform source counts precede the visible counts. Each row represents its individual service feed.

| Station and service | Capture time in UTC | Raw/exact/current | Assigned/unresolved | Platform source → Home/detail |
| --- | --- | --- | --- | --- |
| Kew Gardens District | 2026-11-10 20:33:50.367976 | 1 / 1 / 1 | 1 / 0 | 1 Eastbound 1 → 1/1, 2 Westbound 0 → 0/0 |
| Kew Gardens Mildmay | 2026-11-10 20:33:50.467195 | 17 / 17 / 17 | 6 / 11 | 1 Eastbound 3 → 3/3, 2 Westbound 3 → 3/3 |
| Abbey Wood Elizabeth | 2026-11-10 19:52:54.661255 | 32 / 32 / 32 | 32 / 0 | 3 Westbound 16 → 3/5, 4 Westbound 16 → 3/5 |
| Ealing Broadway Elizabeth | 2026-11-10 19:52:59.929576 | 41 / 41 / 41 | 41 / 0 | 3 Westbound 20 → 3/5, 4 Eastbound 21 → 3/5, all other platforms zero |
| Addiscombe Tram | 2026-11-10 20:11:06.162788 | 8 / 8 / 8 | 8 / 0 | Blank Eastbound 5 → 3/5, blank Westbound 3 → 3/3 |
| East Croydon Tram | 2026-11-10 20:11:06.263327 | 9 / 9 / 9 | 0 / 9 | Published blank Eastbound and blank Westbound each zero |
| Elmers End Tram | 2026-11-10 20:11:07.444829 | 2 / 2 / 2 | 0 / 2 | Published 1 Westbound zero |
| Greenwich Peninsula Cable Car | 2026-11-10 20:10:43.789092 | 0 / 0 / 0 | 0 / 0 | Published blank Northbound zero, feed remains unverified |

- Kew Gardens District publishes `Eastbound - Platform 1`, which matches exactly. Mildmay publishes `Platform 1`, `Platform 2` and `Platform Unknown`. The eleven unknown-label records remain unresolved. The shared physical cards combine only exact District/Mildmay assignments. [District source](https://api.tfl.gov.uk/Line/district/Arrivals/940GZZLUKWG), [Mildmay source](https://api.tfl.gov.uk/Line/mildmay/Arrivals/910GKEWGRDN)
- Abbey Wood publishes `Platform 3` and `Platform 4`, both exact unique Elizabeth identities. The source has sixteen predictions per platform, so the visible row limits explain the smaller card counts. [Source](https://api.tfl.gov.uk/Line/elizabeth/Arrivals/910GABWDXR)
- Ealing Broadway publishes `Platform 3` and `Platform 4`. The other published platforms have zero assigned records in this sample. The numbered labels match the exact Elizabeth service, with catalogue direction added after assignment. [Source](https://api.tfl.gov.uk/Line/elizabeth/Arrivals/910GEALINGB)
- Addiscombe publishes `Eastbound Platform` and `Westbound Platform`. Both match its published blank platform numbers with exact cardinal directions. [Source](https://api.tfl.gov.uk/Line/tram/Arrivals/940GZZCRADD)
- East Croydon publishes `Eastbound - Platform 1` and `Westbound - Platform 3`, while the station archive retains blank platform numbers. This source/catalogue identity mismatch accounts for all nine unresolved records. Additional authoritative evidence is needed before changing those published platform identities. [Source](https://api.tfl.gov.uk/Line/tram/Arrivals/940GZZCRECR)
- Elmers End publishes `Westbound Platform`, while its station archive publishes Platform 1. The blank/numbered identity mismatch accounts for both unresolved records. The implementation preserves that evidence gap. [Source](https://api.tfl.gov.uk/Line/tram/Arrivals/940GZZCRELM)
- Greenwich Peninsula's captured response is empty and establishes no positive live feed capability. The API retains `unverified`, and its board explains that live departures await verification. The runtime handler requests only supported feeds, so this historical response contributes no current request. [Source](https://api.tfl.gov.uk/Line/london-cable-car/Arrivals/940GZZALGWP)

`native/tests/platform-assignment-evidence.test.ts` checks these counts, injects repeated responses through the real server handler, decodes the response in the native client and verifies that each visible row belongs to the selected physical platform.

## Feed and board explanations

The handler retains per-feed outcomes. An exact successful response with zero current records has `liveState: "empty"`. When that feed returned records and the existing freshness rules filtered them all out, it also carries `freshness: "stale"`. The native board reads this detail for the selected services. A rejected feed is `unavailable`. Partial failures preserve successful feeds and their exact assignments. Aggregate `liveState` is `available` for fresh predictions alongside a stale feed and `empty` when every feed is stale. Clients using the baseline schema ignore the optional freshness field and keep any healthy departures.

| Condition | Board explanation | Status tone |
| --- | --- | --- |
| Successful empty platform with no unresolved station predictions | No departures currently assigned to this platform | Success |
| Empty platform with unresolved station predictions | N station prediction(s) await platform assignment | Warning |
| All selected feed records expired | No recent departures available | Warning |
| Some selected services have expired records | No recent departures available for some services | Warning |
| All selected supported feeds unavailable | Live departures temporarily unavailable | Danger |
| Some selected supported feeds unavailable | Some live departures temporarily unavailable | Warning |
| Every platform service explicitly unsupported | Live departures unsupported | Dim |
| Platform has no supported feed and capability awaits verification | Live departures awaiting verification | Dim |
| Cached snapshot older than 30 seconds | Departures are over 30 seconds old | Warning |
| Offline, request/configuration failure or invalid station | Existing specific connectivity/request explanation | Danger |

Empty-board text, status-dot accessibility labels and compact-card accessibility summaries use the same selected state. A board retaining cached rows shows a visible warning when its state is degraded. Expanded boards also report unresolved station predictions alongside other warnings. The unresolved message explicitly refers to station predictions because those identities cannot safely be attributed to any individual card.

## Verification

- `npm test -- src/lib/catalogue/capability.test.ts src/app/api/departures/route.test.ts src/lib/rail/departures.test.ts` passed 121 tests across three files, exit 0.
- `npm run verify` passed TypeScript, ESLint and 434 root tests across 40 files, exit 0.
- From `native`, `npm test -- tests/departures.test.ts tests/platform-board-layout.test.ts tests/server-departures-contract.test.ts tests/platform-assignment-evidence.test.ts` passed 192 tests across four files, exit 0.

- From `native`, `npm run typecheck` passed, exit 0.
- From `native`, `npm test` passed 426 tests across 18 files, exit 0.
- `git diff --check` passed, exit 0.

The task implementation report records the verification logs and earlier failing regression runs.

## Limitations

Fresh public requests on 14 November 2026 returned HTTP 403 for District/Piccadilly Acton Town, District Kew Gardens, Circle Baker Street, Liberty Emerson Park and Greenwich Peninsula Cable Car. Browser access also failed. Historical capture replays and deterministic reproductions provide the implementation evidence. Current live service conditions remain unverified.

East Croydon and Elmers End retain unresolved source/catalogue identity discrepancies described above. Missing and ambiguous labels also remain unresolved. The new UI explains those records while exact physical-platform isolation continues to control which departures a card displays.

Component tests cover compact/expanded visual text and accessibility properties. Physical-device rendering and VoiceOver traversal remain unverified in this task.
