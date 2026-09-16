# Northern domain notes

Raw TfL JSON is parsed at `schemas.ts`; malformed individual predictions are dropped,
while malformed top-level payloads are rejected. Route suitability is independently
proved from ordered official patterns and is never inferred from a station name or
the advertised destination label. The API handler accepts injected dependencies for
fixture-backed tests and preserves partial results only where doing so is safe.
