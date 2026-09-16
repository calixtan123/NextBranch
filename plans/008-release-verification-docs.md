# 008 — Release verification and documentation

Status: Complete for automated checks; manual/live checks are explicitly NOT
RUN. Dependencies: all previous phases.

Scope: README, learning notes, design system, discovery record, plan records,
secret scans, type/lint/test/build/format checks, asset metadata, manifest and
explicit manual/live/browser status.

Tests/commands: see the exact command matrix in `docs/VERIFICATION.md`; at
minimum `npm run verify`, `npm run build`, `git diff --check`, and both `rg`
secret scans.

Done: every status is truthful and credential/browser/HTTPS gaps say NOT RUN.
STOP on a key appearing in public or `.next/static`, or on a false claim of live
testing. Maintenance: update date, versions, exit codes, and counts on each
release candidate.
