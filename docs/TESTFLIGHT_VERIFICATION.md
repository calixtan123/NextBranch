# TestFlight candidate verification

## Candidate and acceptance status

NB-30 repository verification was run on 12 November 2026 on `feat/NB-30-release-verification`, based on `origin/main` at `90ad8b4f31ac3a9117fb68dd7650025916291bae`. Identify the candidate commit after committing with `git rev-parse HEAD`, and record that value with its matching hosted Verify run and eventual signed build. The local results below apply to this branch's refreshed topology and fixture-clock repair. Candidate hosted CI remains pending publication.

Netlify account suspension blocks the actual production-origin iOS export, protected live API smoke check, physical iPhone Wi-Fi/mobile-data checks and final candidate acceptance. NB-29 owns hosting recovery and NB-32 owns the remaining device/live acceptance. Repository checks can proceed while those external gates remain open. [NB-30](https://synapse21.atlassian.net/browse/NB-30) · [NB-29](https://synapse21.atlassian.net/browse/NB-29) · [NB-32](https://synapse21.atlassian.net/browse/NB-32)

## Reviewed Northern topology provenance

Both public TfL responses were retrieved on 12 November 2026 and their raw-byte SHA-256 hashes were checked before projecting the existing capture fields. Each response identifies line `northern` and its requested direction. Both directions contain eight ordered routes.

| Direction | Source | Retrieval completed in UTC | Raw response SHA-256 |
| --- | --- | --- | --- |
| inbound | [TfL inbound sequence](https://api.tfl.gov.uk/Line/northern/Route/Sequence/inbound) | `2026-11-12T15:39:46.239358+00:00` | `57453357381944efd9af86dcac3d0d91d6d8fc4f4f8260993a8f0ef1d703a12c` |
| outbound | [TfL outbound sequence](https://api.tfl.gov.uk/Line/northern/Route/Sequence/outbound) | `2026-11-12T15:39:46.382198+00:00` | `340101de2e30ae2a44f72dea2e94d67d47e0039014ef35470a5780e0a2deb3e8` |

`data/northern-topology-capture.json` uses the last completed retrieval time as `capturedAt`. Its retained fields are line ID, direction and every ordered route's name, ordered NaPTAN IDs and service type. The existing empty `stopPointSequences` representation is preserved because application matching and destination generation use the ordered routes. Each raw response contains ten stop-point sequences, whose provider metadata remains outside this sanitized capture. The raw responses were temporary verification inputs.

Compared with the 15 September capture, all 16 retained route records are exactly equal, including order, names, service types and every station path. There are zero added, removed or changed routes or station paths. The generated map still covers 52 direct origins. Both generated artifacts share `2026-11-12T15:39:46.382198+00:00`, and a second generator run produced byte-for-byte identical files. The tracked capture and generated artifacts provide the durable reproducible input.

The baseline release age check failed with exit 1 at 57 full days. The refreshed check passed with exit 0 at zero full days. The existing 23-day warning and greater-than-30-day release rejection remain covered by tests. The journey test suite uses September predictions, so its bundled fixture now explicitly uses a coherent September capture time. Its expired, invalid and future-capture rejection checks remain in place.

## Witnessed local checks

The controller completed clean root and native `npm ci` before implementation and reported exit 0 with unchanged lockfiles. The implementation checks below ran sequentially in this checkout on 12 November 2026.

| Command or check | Observed result |
| --- | --- |
| `npm run check:topology-age -- --release` before refresh | Exit 1, expired at 57 full days |
| Source SHA-256, Northern line/direction validation and old/new ordered-route comparison | Exit 0, both hashes matched, 8 routes per direction, exact route equality |
| `npm run generate:topology` | Exit 0, 16 routes and 52 direct origins |
| Second generator invocation with before/after byte comparison of both artifacts | Exit 0, both byte-for-byte identical |
| `npm run check:topology-age -- --release` after refresh | Exit 0, zero full days |
| `npm test -- src/lib/northern/topology-generator.test.ts src/lib/northern/topology-age.test.ts src/lib/northern/routeCandidates.test.ts src/lib/northern/stations.test.ts src/app/api/journey/route.test.ts` | Exit 0, 27 tests across 5 files after the observed fixture-clock repair |
| `npm run verify:release` | Exit 0, typecheck, lint, 415 tests across 38 files and release age gate |
| `python3 -m pytest -q tests/catalogue` | Exit 0, 14 tests |
| `npm --prefix native run typecheck` | Exit 0 |
| `npm --prefix native test` | Exit 0, 397 tests across 16 files |
| `npm run build` | Exit 0, optimized Next.js production build |
| `npm run test:e2e` | Exit 0, 40 mobile Chromium/WebKit browser tests |
| `CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios` | Exit 0, iOS Hermes JavaScript bundle exported to ignored `native/dist` |
| `git diff --check` | Exit 0 |

Playwright started its configured temporary production server on `127.0.0.1:3100` with empty TfL credentials and closed it when testing ended. A subsequent listener check found no listener on port 3100, and process inspection found no remaining build, export, Metro or browser-test process started for these checks. Generated build/test outputs remain ignored.

CI runs root typecheck, lint, tests, catalogue tests, build, browser tests and a routine topology-age check. Its native job uses `https://example.invalid` for export. That export establishes JavaScript bundling with a syntactically valid HTTPS origin. The release operator must additionally run `npm run verify:release`, which enforces the release age gate. A successful placeholder export leaves production connectivity and signing/device acceptance pending.

The controller's install audit reported 15 root findings, comprising 8 moderate, 4 high and 3 critical, and 4 moderate native findings. Root findings include Next.js 16.3.5 runtime advisories and Vitest/tinypool development-tool advisories. These remain material release risks for separate dependency remediation. NB-30 preserves the locked dependency versions while recording the risk.

## NB-3 and NB-4 acceptance reconciliation

Prior NB-3 records retain observed Simulator screenshots and walkthroughs for the eight screens, persistence, search/save, management, appearance and representative large text. They also retain open auditory VoiceOver, finger-drag after later changes, time-advanced expiry/offline/background-resume and physical/live checks. The frozen fixture clock cannot establish expiry through ordinary waiting. The historical records describe the versions they observed. [NB-3 verification](design/NB-3-verification.md)

The NB-4 catalogue record now includes Underground, DLR, Overground, Elizabeth line, Tram and shared-platform capabilities through NB-13. Its later sections supersede earlier six-tuple coverage limits. The passenger snapshot contains 460 stations and 1,235 physical platforms, with 1,054 platforms saveable through a supported verified service. Real native callback walkthrough tests cover search, picker, departures, save, persistence and reopen with mocked native view boundaries. Remaining unverified mappings, National Rail unsupported coverage and London Cable Car gaps stay explicit. Simulator/device interaction and VoiceOver acceptance for that broader catalogue remain pending under NB-32. [Catalogue coverage and walkthroughs](TFL_STATION_PLATFORM_CATALOGUE.md#nb-13-shared-platforms-and-final-coverage)

NB-32 must retain device model/OS, candidate commit, signed build identity, API origin, network, scenario and observed result for the outstanding checks. Actual physical acceptance must cover production search/save/reopen, live protected requests, Wi-Fi and mobile data, refresh/expiry, offline/reconnect, background/resume, accessibility and the remaining NB-3/NB-4 scenarios. Netlify recovery is a prerequisite for those production-origin observations. Final TestFlight candidate acceptance remains pending that evidence. [NB-32](https://synapse21.atlassian.net/browse/NB-32)

## Repeatable release steps

Use Node 24.x, run clean installs and retain the candidate identity before recording hosted or signed-build results.

```bash
git branch --show-current
git rev-parse HEAD
npm ci
npm --prefix native ci
npm run generate:topology
git diff -- data/northern-topology-capture.json src/lib/northern/bundledTopology.ts src/lib/northern/direct-destination-map.ts
npm run verify:release
python3 -m pytest -q tests/catalogue
npm --prefix native run typecheck
npm --prefix native test
npm run build
npm run test:e2e
CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm --prefix native run export:ios
git diff --check
```

Review any new topology paths before publication. Repeating generation from the same capture must preserve both artifacts. When the capture ages, retrieve and review fresh inbound and outbound source responses before regenerating.

After hosting recovery, configure the actual absolute HTTPS server origin in `EXPO_PUBLIC_NEXTBRANCH_API_URL` and repeat the export against that origin. Keep TfL credentials server-side. Run the protected live API checks and NB-32 physical acceptance against the same candidate, then attach the matching hosted CI run, signed build identity and observed results before final release acceptance. [Existing production HTTP and mobile checks](VERIFICATION.md)
