# NB-53 privacy evidence and NB-54 deferred coordination

Reviewed on 16 November 2026. NB-53 assessment status **BLOCKED**. The user explicitly deferred NB-54 during this assessment. Its existing source observations and release dependencies are retained for coordination, with implementation and acceptance work deferred. The available source establishes application behaviour and dependency declarations. Production data handling, the signed candidate, App Store Connect processing and physical-iPhone acceptance still require evidence.

## Evidence identity and access

The inspected source HEAD was `de2fbfdbc2ea27cd20eebbe15fac6fcca5adbe02`. The application configuration declares NextBranch `0.0.1`, bundle identifier `com.nextbranch.app`, and iPhone support. EAS production uses remote app-version sourcing, automatic build-number increments, the `production` environment and `NEXTBRANCH_RELEASE_BUILD=1`. The distributed build number, exact build commit, EAS build ID, signing identity, archive identifier and embedded backend origin remain unverified.

| Lead or artifact | Available evidence on 16 November 2026 | Remaining limitation |
| --- | --- | --- |
| Owner-supplied Vercel deployment | Deployment dashboard link supplied for `calixtan-9855/next-branch/3rZ4BeMPTdCQ7fjTotuXM73VtUPK`. The parent agent observed a redirect to Vercel login. | Dashboard settings, deployed SHA, environment, runtime region, logs, retention, access controls, log drains and instrumentation were inaccessible. |
| Owner-supplied deployment hostname | `next-branch-apykpxu8x-calixtan-9855.vercel.app` | Supplied hostname only. Its production assignment, live source parity and inclusion in the signed app have not been established. |
| Owner-supplied App Store Connect page | App `6834507013`, iOS inflight version page. The parent agent observed a redirect to `/login?targetUrl=...&authResult=FAILED`. | Build identity, processing status, privacy warnings, App Privacy answers, privacy-policy URL and tester configuration were inaccessible. |
| Local signed artifacts | The parent agent found no `~/Library/Developer/Xcode/Archives` directory and no IPA in project `outputs` or `native`. This worktree also has no `native/ios` directory. | No signed archive or IPA was available for inspection. These scoped checks do not inventory every location on the computer or remote EAS artifacts. |
| Physical release observations | No exact-candidate iPhone/network/accessibility record was supplied. | Release traffic and physical-device behaviour remain unverified. |

The parent agent has requested sign-in or owner-provided evidence. No credentials or private settings were read or recorded. Historical setup descriptions in `TESTFLIGHT_BETA_INFORMATION.md` and `TESTFLIGHT_VERCEL.md`, including hosting suspension or the earlier live deployment, need reconciliation with this supplied deployment before release copy changes.

The supplied dashboard leads are retained here for the owner. [Vercel deployment](https://vercel.com/calixtan-9855/next-branch/3rZ4BeMPTdCQ7fjTotuXM73VtUPK) · [App Store Connect](https://appstoreconnect.apple.com/apps/6834507013/distribution/ios/version/inflight)

## Source-confirmed data flow

| Surface | Reviewed source and behaviour | Evidence still required |
| --- | --- | --- |
| Saved choices | `native/src/preferences.ts` writes JSON `{ version: 1, cards, mode, recent, interfaceTheme }`. Cards contain saved platform selections and optional style, with array order preserved. `native/src/runtime.ts` supplies AsyncStorage and `nextbranch.preferences` for the live app, with a separate fixture key. Read/write failures produce session-only warnings. | Device backup, uninstall and OS retention behaviour, and final binary storage behaviour. No application-level encryption is implemented in this preferences layer. |
| Station search | `native/src/discovery.ts` searches the bundled catalogue locally. | Confirm the catalogue bundled into the exact candidate and observe device traffic. |
| Native backend request | `native/src/api.ts` constructs `/api/departures?station=<station ID>` against the configured public API origin. It uses GET, an abort signal, `cache: no-store`, `Accept: application/json` and `Cache-Control: no-store`. This custom request supplies a station ID and no saved-card list, recent-history list, account ID or coordinates. | Actual origin, redirects, TLS, host access logs and connection metadata processing. A station query may reveal travel interests and can be associated with IP/request metadata by infrastructure. |
| Server and TfL | `src/app/api/departures/route.ts` validates the station, selects relevant feeds and returns no-store responses. `src/lib/tfl/client.ts` contacts `https://api.tfl.gov.uk` with a server-side `TFL_API_KEY` in the upstream query. Live fetches use no-store. Topology/timetable requests use revalidation. Process-local maps can reuse in-flight and recently completed arrival work. | Deployed source/configuration parity, upstream request/log handling and proxy behaviour. Host log retention remains independently unverified by these cache controls. Any supplied evidence must redact credentials in upstream URLs. |
| Application diagnostics | `src/lib/tfl/diagnostics.ts` emits `console.info("tfl_diagnostic", record)` with fixed fields `operation`, `durationMs`, `errorCategory`, `upstreamStatus` and `topologyFallbackUsed`. It normalizes values and excludes arbitrary error messages, URLs, raw payloads and station IDs. | Host capture of these records, host-generated access/error/security logs, retention, exports, drains, access permissions and deletion procedures. |
| Reachability | `native/src/App.tsx` subscribes with `NetInfo.addEventListener` outside fixtures. Installed NetInfo defaults use native reachability where available, with fallback URL `https://clients3.google.com/generate_204`, method HEAD, empty custom headers, `shouldFetchWiFiSSID: false` and `useNativeReachability: true`. No `NetInfo.configure` override was found in native source. | Observe whether and when the final iPhone build uses the fallback on Wi-Fi, mobile data and reconnect. Source defaults cannot establish every domain contacted by the final runtime. |
| Support | `native/src/ManageScreens.tsx` opens `mailto:calixtan@gmail.com`, with recovery instructions on failure, and directs testers to TestFlight feedback. It also links to TfL data terms. `TESTFLIGHT_BETA_INFORMATION.md` records owner approval of that public address on 12 November 2026. | Owner confirmation of mailbox access, who can read feedback, retention/deletion handling, intended TestFlight group feedback settings and public policy destination. User-initiated email/feedback can contain sender information, text, screenshots and attachments. |
| Additional processing | The reviewed app source and dependency records contain no configured advertising, product-analytics or crash-reporting SDK integration. Existing beta documentation identifies Expo development tooling telemetry and optional OpenTelemetry dependency references. | Final framework inventory, release runtime traffic, host analytics/instrumentation, Apple/TestFlight processing and actual enabled third-party services. Runtime collection cannot be inferred solely from dependency names or source absence. |

The About screen currently includes “Final host logging and retention review is pending.” The available evidence leaves that sentence unresolved. A public privacy-policy link is also absent from its current link list. Replacing the sentence and adding a policy destination require verified host/support facts and an owner-approved usable URL. Final user-facing copy must describe observed collection, purpose, recipients, retention/deletion and contact details consistently with beta notes and App Store answers.

## Source manifest observations for deferred NB-54 coordination

The native lock resolves Expo `58.0.25`, React Native `0.88.1`, AsyncStorage `2.2.0` and NetInfo `12.0.1`. SHA-256 of `native/package-lock.json` was `1fcc390f61a8ba36bbe0cad0147712032d4380f3fe6523348c358ed5bc28170e`. SHA-256 of root `package-lock.json` was `60418cff79598c487d2cc18afa001bcd4a21d10ca6bbfd305b2c78985c551f0f`.

The installed plist files were parsed with Python `plistlib` on the review date.

| Installed dependency file beneath `native/node_modules` | Declared required-reason categories and reasons |
| --- | --- |
| `@react-native-async-storage/async-storage/ios/PrivacyInfo.xcprivacy` | File timestamp, `C617.1`. Empty collected-data array. `RNCAsyncStorage.podspec` declares `RNCAsyncStorage_resources` for this file. |
| `react-native/React/Resources/PrivacyInfo.xcprivacy` | File timestamp, `C617.1`, and UserDefaults, `CA92.1`. |
| `react-native/ReactCommon/cxxreact/PrivacyInfo.xcprivacy` | File timestamp, `C617.1`. |
| `react-native/ReactCommon/react/timing/PrivacyInfo.xcprivacy` | System boot time, `35F9.1`. |
| `react-native/third-party-podspecs/RCT-Folly/PrivacyInfo.xcprivacy` | File timestamp, `C617.1`. |
| `react-native/third-party-podspecs/boost/PrivacyInfo.xcprivacy` | File timestamp, `C617.1`, and system boot time, `35F9.1`. |
| `react-native/third-party-podspecs/glog/PrivacyInfo.xcprivacy` | File timestamp, `C617.1`. |

Each listed React Native plist declares an empty collected-data array and tracking false. These are dependency-authored source declarations. Their presence does not establish final aggregation, every linked framework, actual API usage, or the application's App Privacy answers. No NetInfo source `PrivacyInfo.xcprivacy` was found in the inspected package. Its required declarations must be evaluated against actual release usage and the final aggregated manifest. Reasons above are recorded as found, without selecting new reasons for the release.

## Outstanding NB-53 evidence and deferred release dependencies

| Required owner evidence or action | Acceptance criteria affected | Coordination |
| --- | --- | --- |
| Authenticated Vercel review or dated redacted exports showing the supplied deployment's SHA/environment, production origin and aliases, request/access/runtime/firewall log fields, retention and deletion controls, team roles/access, function/processing regions, log drains and enabled analytics/instrumentation | NB-53 actual host configuration, access controls, regions, third parties and logging/retention | NB-29 deployment owner and NB-31 privacy owner |
| Confirm support mailbox and TestFlight feedback access, message/attachment retention and deletion process, and approve/publish a publicly reachable policy URL | NB-53 feedback handling, destinations, policy and final About copy | NB-31 and NB-33 |
| Provide the exact signed archive/IPA, build commit, dependency lock/hash, version/build, build command/profile, EAS build ID and artifact identifier/checksum | NB-54 candidate identity and final manifest/framework/entitlement inspection | NB-27 |
| Inventory every bundled `PrivacyInfo.xcprivacy`, inspect final aggregated categories/reasons against actual required-reason API usage, review framework versions, final entitlements and permissions, and retain redacted inspection output | NB-54 aggregation, actual API usage and entitlements | NB-27 feeding NB-31/NB-33 |
| Provide exact-candidate App Store Connect upload/processing result, all privacy warnings and resolutions, App Privacy answers and configured privacy-policy destination | NB-54 upload/processing and declaration alignment, NB-53 policy/App Store consistency | NB-33 |
| Run the exact candidate on a physical iPhone, record model/iOS/build/network/time, observe request destinations and data on Wi-Fi/mobile data/offline/reconnect/background/resume, and check storage persistence, support links, VoiceOver and Large Text | NB-53 network/contact/accessibility verification and NB-54 physical-device acceptance | NB-32 feeding NB-31 |

The release owner should retain dated redacted evidence and link it from NB-31. After all facts are available, update About copy, policy, beta notes and App Store declarations together, run native content tests/typecheck, then repeat exact-candidate link/accessibility/network checks. NB-53 stays open while required evidence is missing. NB-54 remains open and explicitly deferred by the user. Its artifact, upload and device checklist above records future coordination needs. No deployment, signed build or upload was performed for this assessment.

## Review checks

Read `native/src/preferences.ts`, `runtime.ts`, `discovery.ts`, `api.ts`, `App.tsx`, `ManageScreens.tsx`, `src/app/api/departures/route.ts`, `src/lib/tfl/client.ts`, `diagnostics.ts`, `native/app.json`, `app.config.js`, `eas.json`, the package/lock records and the existing beta, Vercel and native release documents. Used targeted `rg` searches for request construction, NetInfo overrides, external destinations, diagnostics and manifest paths. Parsed the seven listed dependency manifests and computed both lockfile hashes using Python standard-library tools.

This change adds an evidence document only. Native content tests, typecheck, export and builds were not rerun by this assessment. `git diff --check` is the scoped document whitespace check. Source tests and JavaScript exports cannot supply signed-artifact, live-account or physical-device acceptance evidence.
