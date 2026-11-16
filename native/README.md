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
helpers are imported from the application repository. Live boards anchor server
`generatedAt` to `performance.now()`, an elapsed clock unaffected by changes to
the phone's date or time. Countdowns and freshness share that reference, with
each feed's original `fetchedAt` preserving cached-data age. The full request
duration, including body parsing, is added conservatively; a slow request can
therefore shorten the displayed countdown by up to that duration. Older servers
without `generatedAt` use `observedAt` as an approximation, which cannot recover
age already lost by a legacy server cache. Backgrounding invalidates the anchor;
rows remain hidden until a successful foreground refresh because elapsed time
during suspension may be uncertain. Synthetic fixtures keep their frozen clock.
Countdown minutes round to the nearest minute, with half
minutes rounding up. `Due` starts below 30 seconds remaining and continues through
30 seconds after the expected arrival, inclusive. The row then expires.

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

The app is linked to the existing Expo project `@calixtan/nextbranch-iphone`
with project ID `5b3e4c9b-dcdf-4fec-97f0-55aa1d6a613a`. Authenticated
read-only verification on 15 November 2026 confirmed account `calixtan` and
this project. The link lives in `app.json`.

Account-dependent release steps are below. Apple signing and upload acceptance
remain candidate checks.

1. In `native/`, run `npx eas-cli whoami` and `npx eas-cli project:info`.
   Confirm the intended account and the existing project identity above before
   continuing. If authentication is required, run `npx eas-cli login` and repeat
   those read-only checks.
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

### Encryption export declaration

`app.json` declares `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`.
The release API transport in `src/api.ts` uses React Native `fetch` over HTTPS.
The installed React Native iOS HTTP handler delegates that traffic to Apple's
`NSURLSession`, its native networking API, which supplies operating-system
HTTPS encryption. The app's
runtime stores platform preferences through AsyncStorage. Its installed iOS
implementation writes UTF-8 values and uses React Native's MD5 helper for file
names. These hashes are fixed-length summaries of the keys. Expo Modules Core
uses Apple's CommonCrypto SHA-1 hash for unique identifier generation.
The reviewed app source and dependency declarations support the declaration
through operating-system encryption and these hash uses. Apple guidance covers
third-party library use as well. Recheck the actual linked dependencies and
Info.plist in the signed archive during release acceptance, and review this
declaration whenever encryption usage or dependencies change.
[Apple encryption export guidance](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations) ·
[Apple Info.plist key](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption) ·
[Expo app configuration](https://docs.expo.dev/versions/latest/config/app/)
