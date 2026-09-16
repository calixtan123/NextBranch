# 005 — Journey API, ETA, and ranking

Status: Complete. Dependencies: topology matcher, normalized predictions.

Scope: dependency-injected API handler, 4xx/5xx matrix, no-store responses,
partial destination/timetable degradation, live ETA safety gates, timetable
estimates, cap/count, confidence/via, and deterministic ranking/minutes saved.

Tests/commands: `npm test -- src/app/api/journey/route.test.ts src/lib/northern/eta.test.ts src/lib/northern/ranking.test.ts`.

Done: absent identity, stale snapshots, mismatch, duplicate, nonpositive and
out-of-window ETA evidence fails closed. STOP if origin data is unavailable.
Maintenance: keep normal tests fixture-only and never add live calls.
