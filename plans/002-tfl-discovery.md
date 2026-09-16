# 002 — TfL discovery

Status: Complete for the recorded 2026-09-15 snapshot; live refresh partial.
Dependencies: foundation.

Scope: sample named Northern stations, route sequences, arrivals, timetable
metadata, field formats, vehicle grouping/conflicts, branch/terminus evidence,
and sanitized optional fixture output in `scripts/tfl-discovery.mjs`.

Tests/commands: `node scripts/tfl-discovery.mjs --fixture tests/fixtures/tfl/camden-arrivals.json`; live command only with `TFL_API_KEY`.

Done: findings answer all five questions in `docs/TFL_DISCOVERY.md`. STOP if a
fixture path is not explicit or a key could enter output. Maintenance: repeat
longitudinally; one snapshot cannot establish vehicle stability.
