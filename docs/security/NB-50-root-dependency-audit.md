# NB-50 root dependency audit

Date: 2026-11-15. Node v24.22.2, npm 11.19.1. Base commit 89d7362. Prior work: NB-34 (bd646b4).

## Result

No compatible supported remedy exists today. `package.json` and `package-lock.json` are unchanged. The advisory is a documented residual risk, development/build tooling only.

## Advisory

The audit reports 7 moderate package records, but only one unique advisory:
GHSA-g3hv-75wg-m249 (CWE-405, `minimatch` DoS via globparts amplification), vulnerable range `>=7.0.0 <11.0.1`.
The other six records are packages that inherit the finding through `@typescript-eslint/typescript-estree`.

| Package | Role | Range flagged |
| --- | --- | --- |
| minimatch (10.2.6, nested under typescript-estree) | transitive, source | 7.0.0 - 11.0.0 |
| @typescript-eslint/typescript-estree | transitive | 6.16.0 - 8.72.2 |
| @typescript-eslint/utils, type-utils, parser, eslint-plugin | transitive | 6.16.0 - 8.72.2 |
| typescript-eslint | transitive | <=8.72.2 |

All are dev dependencies. The only root path is `eslint-config-next@16.4.6` (devDependency) -> `typescript-eslint@8.72.2` -> `@typescript-eslint/*@8.72.2` -> `@typescript-eslint/typescript-estree@8.72.2` -> `minimatch@10.2.6`.
Other `minimatch` copies in the tree (3.1.5) are not affected.

## Exposure

- `npm audit --omit=dev --json`: exit 0, zero vulnerabilities. Nothing ships in the production dependency set.
- Reachable only when ESLint (`npm run lint`, `npm run verify`) parses source with typescript-eslint, on developer machines and CI. Glob patterns come from repository config, not untrusted input.
- Native (`native/`) manifests and locks are out of scope and untouched.

## Why no fix

- `npm audit fix --dry-run --json`: exit 1 (audit still reports findings), zero add/change/remove, although `fixAvailable` is `true`.
- Latest stable `typescript-eslint` is 8.72.2 (npm `latest`); its `typescript-estree` depends on `minimatch ^10.2.2`, which cannot resolve to `>=11.0.1`.
- Only `@typescript-eslint/typescript-estree@8.72.3-alpha.8` (canary) depends on `minimatch ^11.0.1`. A prerelease canary is not a supported remedy, so it was not adopted.
- Forcing `minimatch@11` would need an npm `overrides` entry or `--force`. The brief forbids both without demonstrated compatibility. It was not tried: minimatch 11 is a major bump over the API typescript-estree 8.72.2 was tested with.

## Residual risk and follow-up

Low: moderate DoS in a dev-only tool with trusted inputs. Re-check when a stable `typescript-eslint` release depends on `minimatch >=11.0.1`, then run `npm update typescript-eslint` (lock-only) and re-audit.

## Verification (2026-11-15, unchanged lockfile)

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | clean install |
| `npm audit --json` | 1 | 7 moderate, 0 high/critical |
| `npm audit --omit=dev --json` | 0 | 0 vulnerabilities |
| `npm audit fix --dry-run --json` | 1 | no changes proposed |
| `npm run verify` | 0 | typecheck, lint, 458/458 tests (40 files) pass |
| `npm run build` | 0 | pass |
| `git diff --check` | 0 | clean |

Raw outputs: `.superpowers/sdd/nb-50-root-security/evidence/`.
