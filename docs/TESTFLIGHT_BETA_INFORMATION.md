# TestFlight beta information

Reviewed for NB-31 on 12 November 2026 against this candidate’s application code, dependency locks and bundled catalogue. Open Settings → About and privacy in the iPhone app for the concise tester-facing version.

## Privacy and data handling

| Area | Source-confirmed behaviour | Release review still needed |
| --- | --- | --- |
| Saved choices | `native/src/preferences.ts` serializes saved platforms, their order and display styles, recent station IDs, global display mode and interface theme to AsyncStorage. `native/src/runtime.ts` uses the `nextbranch.preferences` key for the live app. Storage failures show a session-only warning. | Confirm final device backup, uninstall and OS storage behaviour before giving deletion or retention guarantees. AsyncStorage is ordinary app storage. No application-level storage encryption is implemented here. |
| Search | `native/src/discovery.ts` loads the bundled shared catalogue. Station name matching runs locally. | Verify the final release bundle contains the intended catalogue. |
| Departure requests | `native/src/api.ts` sends `GET /api/departures?station=<station ID>` to `EXPO_PUBLIC_NEXTBRANCH_API_URL`. Release configuration requires HTTPS. The custom request contains no saved-card list, recent-search list, account ID or coordinates. Network providers and the server can receive IP addresses and ordinary connection/request metadata. | Observe the actual deployed origin, TLS, request/access logs, CDN/proxy processing, regions, access controls and retention. Hosting is suspended and no final host configuration has been observed. |
| Server and TfL | `src/app/api/departures/route.ts` validates station IDs and selects reviewed line/stop feeds. `src/lib/tfl/client.ts` requests `api.tfl.gov.uk` using a server-side `TFL_API_KEY`. Live requests and API responses use no-store. Pending identical arrival requests can share a promise until settlement. The separate web journey flow can cache topology/timetables for 43,200 seconds. | Check deployed routes match this source, secrets remain server-side and no proxy adds persistent response caching. No-store describes caching, while host logging remains a separate review. |
| Diagnostics | `src/lib/tfl/diagnostics.ts` writes operation, duration, error category, upstream status and topology-fallback flag using `console.info`. Its fixed output omits raw payloads, station IDs, URLs and credentials. | Confirm host log capture, any additional access/error logs, retention periods and deletion procedures. No exact log retention has been established. |
| Connectivity | The installed NetInfo 12.0.1 default configuration uses native reachability when available and can fall back to a HEAD request to `https://clients3.google.com/generate_204`. Wi-Fi SSID fetching defaults to false. The app subscribes to connectivity state in `native/src/App.tsx`. | Observe reachability behaviour on the final iPhone build and include third-party network processing in the final privacy review. |
| Feedback | Testers initiate TestFlight feedback, optionally attaching screenshots and diagnostic information through Apple. Feedback content can disclose journeys or personal information chosen by the tester. | Check the final TestFlight configuration, reviewer access and feedback handling with the owner. |
| Other dependencies | `native/package.json`, `native/package-lock.json`, root `package.json` and `package-lock.json` were inspected. The app source has no configured advertising, product-analytics or crash-reporting SDK. Expo development tooling includes telemetry code. Optional OpenTelemetry peer references appear in the locks. Those references alone do not establish runtime collection. AsyncStorage includes a bundled `PrivacyInfo.xcprivacy`. | Inspect the final archive’s aggregated privacy manifests, entitlements, linked native frameworks and runtime network traffic. Confirm Expo/development-client tooling and any host instrumentation in the distributed build. Dependency manifests do not prove all third-party behaviour. |

The source has no native account/sign-in flow, location-permission request or application database for user profiles. This review makes no unconditional zero-collection promise. OS services, Apple’s TestFlight and the eventual host require their own verified disclosures.

## Beta feedback

Open TestFlight, select NextBranch, then choose **Send Beta Feedback**. Include the app version, station, line, platform, approximate time, expected result and actual result. Check screenshots and omit personal details, private journeys and credentials.

The owner selected TestFlight feedback as the support channel for this beta on 12 November 2026.

## Catalogue and coverage

Counts were computed from the current checked-in inventory through the real `createCatalogue` and `serviceCapability` functions. The calculation used a temporary Node TypeScript transpilation loader and wrote its audit output outside the repository. The source archive was retrieved on 10 November 2026, with internal file date 20 October 2026.

| Scope | Stations | Physical platforms | Platform/service relationships |
| --- | ---: | ---: | ---: |
| Full source inventory | 509 | 1,584 | 1,878 |
| Passenger-facing in-app catalogue | 460 | 1,235 | 1,528 |

The app retains customer-facing platforms with at least one TfL service and preserves their shared service descriptions. Within the in-app catalogue, 1,054 platforms have at least one verified service/platform mapping and 181 are browse-only. There are 1,162 supported, 237 unverified and 129 unsupported platform/service mappings. These totals describe static reviewed capability. They do not guarantee current live predictions or whole-line coverage.

National Rail live integration is unsupported, including National Rail relationships retained beside verified TfL services. A supported line feed can still have unverified physical-platform mappings. A wholly unverified platform remains browse-only. A shared platform may show verified departures for one line while another line remains unverified. London Cable Car retains its two physical platforms as unverified and browse-only. Empty upstream cable-car responses did not establish unsupported capability. Blank published platform numbers remain blank.

The source inventory and its specification are linked below. The broader National Rail inventory is partial. [TfL source archive](https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip) · [TfL inventory guide](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf)

### Representative tester routes

Each path starts from Home → Add a platform → station search → the named platform. A verified mapping should offer a board/save action. Live trains still depend on the deployed backend and current upstream availability. Use station displays when travelling.

| Station and platform | Verified service and stop | Expected boundary |
| --- | --- | --- |
| Camden Town, platform 2, Southbound | Northern, `940GZZLUCTN` | Verified Northern mapping and normal board/save path. |
| Canary Wharf, DLR platform 1, Southbound | DLR, `940GZZDLCAN` | Keep the DLR platform distinct from Jubilee platform 1, Westbound, at `940GZZLUCYF`. Both mappings are verified. |
| Canary Wharf, platform A, Eastbound | Elizabeth line, `910GCANWHRF` | Verified lettered platform. Preserve the published letter. |
| Reading, platform 14, Eastbound | Elizabeth line, `910GRDNGSTN` | Elizabeth mapping verified. Shared National Rail service stays unsupported. |
| Addington Village, blank platform number, Eastbound | Tram, `940GZZCRADV` | Verified direction-only published platform. Preserve the blank number. |
| Kew Gardens, platform 1, Eastbound | District, `940GZZLUKWG`, and Mildmay, `910GKEWGRDN` | Both shared-line mappings verified. |
| Kew Gardens, platform 2, Westbound | Mildmay, `910GKEWGRDN` | Mildmay mapping verified. District mapping at `940GZZLUKWG` remains unverified. The platform can be saved for its verified service. |
| Barking, platform 7, Eastbound | Suffragette feed supported, mapping unverified | Browse-only. Shared National Rail service unsupported. |
| Greenwich Peninsula, blank platform number, Northbound | London Cable Car, `940GZZALGWP` | Feed and mapping unverified. Browse-only. |

Capability evidence is checked in under `data/tfl-underground-evidence.json`, `data/tfl-dlr-evidence.json`, `data/tfl-overground-evidence.json`, `data/tfl-elizabeth-evidence.json`, `data/tfl-shared-evidence.json` and `data/tfl-tram-cable-evidence.json`. `src/lib/catalogue/capability.ts` applies the reviewed boundary. Deployed-backend parity and physical-route checks remain pending.

## Attribution and unofficial status

The official TfL Transport Data Service terms were retrieved on 12 November 2026. Their Requirements section specifies the following source and derived-data credits, all included verbatim in Settings → About and privacy.

- Powered by TfL Open Data
- Contains OS data © Crown copyright and database rights 2016
- Geomni UK Map data © and database rights [2019]

The licence’s Non-endorsement section prohibits suggesting official status or endorsement. The app states that NextBranch is unofficial and is not endorsed by Transport for London. No TfL logo was added. The screen links directly to the official terms. External-link failure displays an alert containing the destination and browser/TestFlight recovery instructions. [TfL Transport Data Service terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service)

## Release checks still pending

- Review the final hosted deployment’s data processing, access and diagnostic logs, third parties, retention, regions, security controls and deletion handling. Hosting is suspended.
- Verify deployed-backend response shape, catalogue/capability parity and representative live routes from the release app.
- Owner to supply or approve a public privacy-policy URL if required by App Store Connect/TestFlight or the final distribution channel. No published policy destination is asserted by this change.
- Review App Store privacy declarations and the final archive’s privacy manifests, permissions, frameworks and runtime network traffic against the observed host and dependencies.
- Check physical-iPhone VoiceOver reading order, heading navigation, external-link announcements, alert recovery and Large Text wrapping/scrolling in light and dark appearance. Automated element checks establish roles and minimum 44-point action styles, while physical-device checks remain pending.
- Confirm TestFlight feedback is enabled for the intended tester group and that the owner can receive feedback.
