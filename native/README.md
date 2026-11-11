# NextBranch for iPhone

Install with Node 24 and `npm ci` from this directory. Expo SDK 58 targets
iPhone on iOS 16.4 and newer. A local Xcode development build runs with
`npm run ios`. Use `npm start` to reconnect an installed development build.
The generated Xcode project lives in `native/ios`.

Set `EXPO_PUBLIC_NEXTBRANCH_API_URL` to the server origin. Development permits
HTTP for local testing. Production requires an absolute HTTPS origin. The
server owns the TfL credentials. Only the public origin belongs in Expo config.

For a deterministic development preview, set
`EXPO_PUBLIC_NEXTBRANCH_FIXTURE=three-card-home`. Also set
`EXPO_PUBLIC_NEXTBRANCH_SEED=1` to prefill the three design cards on the first
fixture launch. Fixture preferences are separate from normal preferences.
Other fixture scenarios are `empty-camden-a`, `camden-outage`, and
`camden-rate-limited`. Every fixture uses the preparation pack's synthetic A/B
platforms and a frozen observation clock. Colindale B is an additional synthetic
selection for exercising empty and replacement screens. Requests for other
stations fail within the fixture adapter.

`assets/platform-catalogue.json` is the versioned boundary for reviewed physical
platforms. Each record provides `stationId`, `platform`, and `direction` with
the exact spelling the API returns. Keep the source and verification provenance
with catalogue changes. Canonical station search, countdown and London clock
helpers are imported from the application repository.

Run `npm run typecheck`, `npm test`, and `npm run export:ios` for the local
static checks. See the [verification record](../docs/design/NB-3-verification.md)
for the pinned design and device-check status.
