# NB-55 CI dependency provenance

Verified on 15 November 2026 against the official action repositories and Microsoft Container Registry (MCR). The workflow resolves the existing action majors and Playwright version to immutable content references.

## Reviewed action releases

| Official action | Previously selected tag | Reviewed release | Full commit SHA |
| --- | --- | --- | --- |
| actions/checkout | v4 | v4.4.0 | `11d5960a326750d5838078e36cf38b85af677262` |
| actions/setup-node | v4 | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| actions/setup-python | v5 | v5.6.0 | `a26af69be951a213d495a4c3e4e4022e16d87065` |

Each major tag and listed release tag resolved to the same commit. Checkout v4.3.1 resolves to `34e114876b0b11c390a56381ad16ebd13914f8d5`, so its commit would select an older release than the current v4 tag. Checkout v4.4.0 includes safer pull_request_target defaults. This workflow uses push and pull_request. All three pinned action.yml files declare the node20 action runtime. The application's Node 24.x and Python 3.12 selections remain in the workflow.

The official release records and their changelogs were reviewed. [Checkout v4.4.0](https://github.com/actions/checkout/releases/tag/v4.4.0), [setup-node v4.4.0](https://github.com/actions/setup-node/releases/tag/v4.4.0), [setup-python v5.6.0](https://github.com/actions/setup-python/releases/tag/v5.6.0).

The following official remote-ref checks all returned exit 0. Their output included the major/release mappings in the table. The checkout output also included v4.3.1 as recorded above.

```sh
git ls-remote https://github.com/actions/checkout.git 'refs/tags/v4*'
git ls-remote https://github.com/actions/setup-node.git 'refs/tags/v4*'
git ls-remote https://github.com/actions/setup-python.git 'refs/tags/v5*'
```

Official release metadata and action definitions were fetched with these command patterns, substituting each repository, reviewed release and SHA from the table. All six requests returned exit 0. The release tag_name and html_url matched the reviewed releases.

```sh
curl -fsSL https://api.github.com/repos/actions/checkout/releases/tags/v4.4.0
curl -fsSL https://raw.githubusercontent.com/actions/checkout/11d5960a326750d5838078e36cf38b85af677262/action.yml
```

## Playwright image

`mcr.microsoft.com/playwright:v1.63.0-noble` resolved to the OCI image index `sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`. The workflow pins this index. The registry returned HTTP 200 and the same Docker-Content-Digest header. Independently hashing the 705 response bytes returned the same digest.

```sh
curl -fsSL -D /tmp/nb55-manifest-headers.txt \
  -H 'Accept: application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json' \
  https://mcr.microsoft.com/v2/playwright/manifests/v1.63.0-noble \
  -o /tmp/nb55-manifest.json
shasum -a 256 /tmp/nb55-manifest.json
```

Both commands returned exit 0. The index contains linux/amd64, matching the ubuntu-24.04 hosted runner, and linux/arm64. Its linux/amd64 manifest is `sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7`. Its config is `sha256:2c1f4e0fd6450f43ddb46d60c2a6df30855a8588e165b1f2559fb0eda8d7ff35`. Both were fetched successfully from MCR and their response-byte SHA-256 hashes matched those references.

```sh
curl -fsSL -H 'Accept: application/vnd.oci.image.manifest.v1+json' \
  https://mcr.microsoft.com/v2/playwright/manifests/sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7 \
  -o /tmp/nb55-amd64-manifest.json
curl -fsSL \
  https://mcr.microsoft.com/v2/playwright/blobs/sha256:2c1f4e0fd6450f43ddb46d60c2a6df30855a8588e165b1f2559fb0eda8d7ff35 \
  -o /tmp/nb55-amd64-config.json
```

Both commands returned exit 0. The config declares linux/amd64, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` and a Node 24 build argument. The official noble Dockerfile installs Chromium, Firefox, WebKit and their system dependencies. The lockfile resolves @playwright/test, playwright and playwright-core to 1.63.0. The official v1.63.0 browsers.json exactly matched the installed locked playwright-core file, including Chromium revision 1243, Firefox 1543 and WebKit 2359. Both official source requests returned exit 0. [Dockerfile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/Dockerfile.noble), [browser revisions](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/browsers.json).

```sh
curl -fsSL https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/utils/docker/Dockerfile.noble \
  -o /tmp/nb55-Dockerfile.noble
curl -fsSL https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/packages/playwright-core/browsers.json \
  -o /tmp/nb55-browsers.json
```

## Reviewed update procedure

No Dependabot, Renovate or other dependency-update configuration exists in this checkout. Use the existing pull-request and Verify workflow for reviewed updates.

1. Resolve the intended supported action release against its official release record and full git ref. Review the release notes and action runtime before changing its SHA and adjacent version comment.
2. For a Playwright update, align the locked package version with the official image version. Fetch the image index with the command above, compare its Docker-Content-Digest header with a local SHA-256 calculation, and verify linux/amd64 support and matching browser revisions. Update the image digest, version comment and this provenance record together.
3. Review the workflow diff and parsed configuration. Preserve all checks, triggers, permissions, runtime versions, cache keys and environment settings unless the update explicitly requires a reviewed change.
4. Require both hosted Verify jobs to pass on the candidate head before completing NB-55. Record the final commit and successful run links in Jira and NB-30.

## Verification boundary

Local YAML parsing and semantic comparison against the baseline verify that only the five action references and image reference changed. Actionlint 1.7.12 checked the workflow successfully with `/tmp/nb55-actionlint/actionlint -shellcheck= .github/workflows/verify.yml` (exit 0). Its official darwin/arm64 archive matched the published checksum `aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f`. Shellcheck was unavailable, so the command disables its optional integration. `git diff --check` also passed. The hosted jobs are required to validate actual action execution and image startup. At delegation time, the parent's hosted baseline at bda17a3 had 11 failing live-screens storage-count assertions in verify-native. That existing failure requires resolution before NB-55 can meet its both-jobs-pass acceptance criterion. Record the final hosted result separately from the local provenance checks.
