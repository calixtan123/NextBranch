# 001 — Foundation

Status: Complete. Dependencies: none.

Scope: Next App Router shell, strict TypeScript, local Atkinson fonts, shared
styles, package scripts, icons, and `.env.example`/`.gitignore` hygiene.

Tests/commands: `npm ci`; `npm run typecheck`; `npm run lint`; `npm test`.

Done: app boots, metadata and manifest exist, source is strict, and secrets are
not committed. STOP on a build that exposes a server environment variable.
Maintenance: keep Node engine and dependency versions aligned with CI.
