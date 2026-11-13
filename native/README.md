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

## TestFlight release build

Repository preparation lives in `app.config.js` (release gate and icon),
`eas.json` (the `production` profile) and `assets/icon.png`. The profile uses
remote app version source, the EAS `production` environment and
`autoIncrement`, so EAS owns the iOS build number. Bundle identifier stays
`com.nextbranch.app`. The initial TestFlight app version is `0.0.1`.

The release gate runs whenever EAS evaluates the config for the `production`
profile (`NEXTBRANCH_RELEASE_BUILD=1`). It rejects a missing
`EXPO_PUBLIC_NEXTBRANCH_API_URL`, non-HTTPS, credentials, path, query or
fragment, placeholder or reserved hosts (`example.*`, `.invalid`, `.test`) and
local or private hosts, and any `EXPO_PUBLIC_NEXTBRANCH_FIXTURE` or `_SEED`.
Local development and `npm run export:ios` are not release builds and are not
gated. The gate checks the URL's shape only, not that the server is reachable.
The backend host is not decided, so no URL is committed.

The icon is a 1024 pixel RGB PNG (no alpha, which App Store Connect rejects).
Regenerate it with `node scripts/generate-icons.mjs` from the repository root;
the same script owns the web icons.

Steps that need authenticated Apple and Expo accounts (not done in the repo):

1. `npx eas-cli login`, then `npx eas-cli init` in `native/` to link the Expo
   project (writes the project id into config; commit it once verified).
2. Confirm the bundle identifier exists in Apple Developer and App Store
   Connect, and create the app record.
3. `npx eas-cli env:create --environment production --name EXPO_PUBLIC_NEXTBRANCH_API_URL --value https://<backend-origin> --visibility plaintext`
4. `npx eas-cli build --platform ios --profile production` (EAS manages
   credentials and the build number; sign in with the Apple account when asked).
5. `npx eas-cli submit --platform ios --profile production --latest`
   (Needs an App Store Connect app id or interactive login.)

Candidate evidence to record: git commit, version, build number, exact build
command, EAS build id, App Store Connect processed build identifier.

Privacy manifests: after a build, check the dependencies that touch required
reason APIs (for example `@react-native-async-storage/async-storage`, React
Native core) include or aggregate a `PrivacyInfo.xcprivacy`, and fix any
App Store Connect warnings. This can only be confirmed from the real archive
and upload validation, not from the repository.
