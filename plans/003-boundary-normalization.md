# 003 — Boundary and normalization

Status: Complete. Dependencies: foundation, discovery.

Scope: Zod parsing, malformed-record discard, exact platform parsing, direction
fallback, stale/departure filtering, upstream-ID preference, deterministic
identity hashing, and browser response validation.

Tests/commands: `npm test -- src/lib/northern/schemas.test.ts src/lib/northern/identity.test.ts src/lib/northern/predictions.test.ts src/lib/journey-view.test.ts`.

Done: only validated domain fields cross boundaries; exact requested journeys
are accepted in the browser. STOP on malformed or ambiguous identity data.
Maintenance: add fixture cases when TfL changes field wording.
