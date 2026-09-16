# 004 — Topology and matcher

Status: Complete. Dependencies: discovery, boundary normalization.

Scope: direct-pair proof, branch hints, route candidates, short-turn slicing,
all-true/all-false/disagreement/unknown suitability, ambiguity counting, and
fresh bundled fallback for empty or malformed topology.

Tests/commands: `npm test -- src/lib/northern/route.test.ts src/lib/northern/routeCandidates.test.ts src/app/api/journey/route.test.ts`.

Done: no route is guessed from a destination label; known unsuitable trains are
not counted as withheld. STOP on no safe candidate. Maintenance: regenerate the
bundled snapshot before its 30-day limit.
