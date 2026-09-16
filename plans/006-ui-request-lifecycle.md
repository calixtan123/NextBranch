# 006 — UI and request lifecycle

Status: Complete. Dependencies: journey API.

Scope: accessible search/results/saved views, keyed cached data, aborts, online
and visibility polling, results-only listeners/expiry refresh, retry/stale copy,
and explicit success counting.

Tests/commands: `npm test -- src/components/Home.test.tsx src/components/useJourneyRequest.test.ts src/components/TrainCard.test.tsx`.

Done: leaving results stops polling/listeners; returning or activating resumes.
STOP on stale data being presented as a fresh recommendation. Maintenance: test
React effect cleanup when changing view behavior.
