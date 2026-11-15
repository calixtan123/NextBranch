# NB-51 and NB-52 native dependency review

Reviewed 15 November 2026 against commit `bda17a3d117adbd77da346969c279ed6dde444c0`, using Node `v24.22.2` and npm `11.19.1`. Official registry and advisory requests succeeded. Native manifests and lockfile remain unchanged after a clean install and compatibility assessment.

## Advisory count and dependency path

Fresh `npm audit --json` exits 1 and reports three moderate affected package records, comprising one unique advisory. The affected installed path is `expo@58.0.25` → `@expo/fingerprint@0.21.10` → `minimatch@10.2.6`.

| Record | Audit affected range | Installed version |
| --- | --- | --- |
| minimatch | `>=7.0.0 <11.0.1` | 10.2.6 |
| @expo/fingerprint | `>=0.11.12-canary-20250303-4dba60e` | 0.21.10 |
| expo | `>=53.0.0-canary-20241211-61c49bd` | 58.0.25 |

The source advisory is GHSA-g3hv-75wg-m249 / CVE-2026-118764, globparts amplification causing excessive CPU and memory consumption. The official advisory requires attacker-controlled glob input with `optimizationLevel >= 2`. Its first patched release is minimatch 11.0.1. The other two records inherit this finding through the dependency graph. [Official advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) · [Patched upstream release](https://github.com/isaacs/minimatch/releases/tag/v11.0.1)

## Exposure and mitigation

The installed fingerprint source narrows the exposure assessment further. `build/utils/Path.js` constructs matchers with `{ dot: true }`, which leaves minimatch's `optimizationLevel` at its default of 1. `build/Options.js` explicitly documents this advisory and the unavailable vulnerable preprocessing option. Calls in `Options.js` and `ExpoConfigLoader.js` preserve those defaults. Installed minimatch's `dist/commonjs/index.js` invokes `firstPhasePreProcess` and `secondPhasePreProcess` only for optimization levels at least 2. The affected preprocessing is therefore unreachable through the reviewed fingerprint call sites.

Fingerprint consumes repository ignore/configuration paths such as `.fingerprintignore` and fingerprint config. Expo exposes it through `expo/bin/fingerprint` and `expo/fingerprint.js`, which require Node tooling. The app enters through `native/index.ts`, imports Expo's root registration API and its own App, and has no application fingerprint/minimatch imports. The successful iOS export source map contains 1,079 source entries with zero fingerprint or minimatch entries. This establishes tooling exposure for the reviewed application bundle. npm classifies the path as production dependencies because Expo declares fingerprint in `dependencies`, so production-only npm audit filtering cannot establish iPhone runtime reachability.

Keep repository build configuration and ignore patterns review-controlled. Preserve the default matcher options and reassess any future fingerprint/minimatch customization. The installed version still falls within npm's affected range. The observed call sites exclude the advisory's triggering option, while future upstream behavior changes need another review.

## Supported remediation and revisit condition

Official npm metadata identifies Expo `58.0.25` as `latest` and fingerprint `0.21.10` as `latest`. Published Expo depends on fingerprint `^0.21.10`, and published fingerprint depends on minimatch `^10.2.6`. That minimatch range excludes patched major 11. The current supported stable dependency path offers no package-level advisory remediation. The audit's proposed `fixAvailable` targets Expo `52.0.49` with `isSemVerMajor=true`. That would replace the SDK dependency set and requires a separate migration decision.

Revisit when a stable fingerprint release accepted by the supported Expo SDK depends on minimatch `>=11.0.1`, or a supported upstream backport resolves the advisory. Confirm that Expo's declared dependency range and bundled compatibility metadata accept the release, refresh the audit, and run clean install, compatibility checks, typecheck, native tests and iOS export. Native changes must then flow into the NB-27 signed candidate and NB-32 physical acceptance. [Expo releases](https://github.com/expo/expo/releases) · [Fingerprint package source](https://github.com/expo/expo/tree/main/packages/%40expo/fingerprint)

## Suggested React and SVG updates

| Package | Installed/resolved | Expo 58.0.25 bundled expectation | Decision |
| --- | --- | --- | --- |
| expo | 58.0.25 | Current stable SDK | Keep |
| react | 19.3.0 | Exact 19.3.0 | Keep, published 19.3.1 exceeds the SDK expectation |
| react-native | 0.88.1 | Exact 0.88.1 | Keep |
| react-native-svg | 15.16.0 | Exact 15.16.0 | Keep, published 15.16.1 exceeds the SDK expectation |
| @react-native-async-storage/async-storage | 2.2.0 | Exact 2.2.0 | Keep |
| @react-native-community/netinfo | 12.0.1 | Exact 12.0.1 | Keep |
| typescript | 6.0.3 | Project `~6.0.3` | Keep |
| @types/react | 19.3.0 | Project `~19.3.0` | Keep |

`npm view react@19.3.1 version` and `npm view react-native-svg@15.16.1 version` confirm both suggested patches exist. SVG's published React and React Native peers are `*`, which permit many versions at installation time. Expo's narrower native-module recommendation remains 15.16.0. React Native's installed Fabric renderer identifies React version 19.3.0. The patch label and broad peer constraints supply insufficient supported compatibility evidence for the suggested bumps.

Expo constraints vary by package. Its bundled metadata uses exact versions for the packages above and ranges such as `~4.30.1` for screens and `~5.11.1` for safe-area-context. Expo's own fingerprint dependency uses a caret range. The project preserves all these existing constraints. Revisit React/SVG when the supported SDK's bundled metadata or an explicit official compatibility update accepts the patches, then validate the native candidate. [Expo package metadata](https://registry.npmjs.org/expo/58.0.25) · [React package metadata](https://registry.npmjs.org/react/19.3.1) · [SVG package metadata](https://registry.npmjs.org/react-native-svg/15.16.1)

## Verification

Commands run from `native/` unless specified. Registry requests used official npm metadata. Raw command output and exit codes are retained in `.superpowers/sdd/plan/task-1-evidence/` for this working session.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm ci` | 0 | 529 packages installed, lockfile unchanged |
| `npm audit --json` | 1 | Three moderate package records, one unique advisory |
| `npm explain minimatch --json` | 0 | Single installed vulnerable path through fingerprint |
| `npm ls expo @expo/fingerprint minimatch react react-native react-native-svg @react-native-async-storage/async-storage @react-native-community/netinfo typescript @types/react --json` | 0 | Resolved versions match table |
| `CI=1 EXPO_NO_TELEMETRY=1 npx expo install --check` | 0 | Dependencies are up to date |
| `CI=1 EXPO_NO_TELEMETRY=1 npx --yes expo-doctor@1.21.8` | 0 | 20/20 checks passed |
| `npm run typecheck` | 0 | Native TypeScript passes |
| `npm test -- tests/app-navigation.test.ts tests/interface-controls.test.ts tests/stations-compatibility.test.ts` | 0 | Eight tests pass across three files |
| `npm test -- tests/live-screens.test.ts` | 1 | Six pass, eleven fail on storage write-count assertions |
| `CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_NEXTBRANCH_API_URL=https://example.invalid npm run export:ios -- --source-maps` | 0 | Hermes iOS bundle and source map exported |
| Source-map inspection | 0 | 1,079 sources, zero fingerprint/minimatch entries |
| `git diff --exit-code -- native` from root | 0 | All tracked native files equal reviewed HEAD |

The live-screens failure reproduces on unchanged tracked native files. Its fixture omits `recent`, while `preferences.ts` classifies missing `recent` as corrupt and persists recovered preferences, introducing an extra write observed by the assertions. This explains the observed write counts and remains an existing verification limitation requiring a separate scoped repair. The parent also confirmed the same failure in the hosted baseline run. [Baseline Verify run](https://github.com/calixtan123/NextBranch/actions/runs/43776223172)

## Prior work and release coordination

NB-34 commit `bd646b42df314d55c23f6fc80361859ad560a218` adopted Expo 58.0.25 and retained the same React, React Native, SVG, AsyncStorage and NetInfo versions reviewed here. This assessment preserves that compatible set. NB-50 documents the separate root-toolchain minimatch path, with its own upstream remediation condition. [Root dependency review](security/NB-50-root-dependency-audit.md)

NB-30's existing release record describes historical tests and a placeholder-origin export. Its earlier four-moderate native count is superseded for this assessment by the fresh three-record audit. Existing signed archive, actual production-origin connectivity and physical-device evidence remain release gates. NB-27 must retain the exact candidate commit and native lockfile identity when archiving, and carry this advisory disposition into archive evidence. NB-32 supplies physical acceptance. This assessment makes no native dependency change, and its placeholder-origin export establishes JavaScript bundling only. Final signed archive and device proof remain pending with their release owners. [Release verification](TESTFLIGHT_VERIFICATION.md)
