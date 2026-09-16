# 007 — Saved journeys and PWA

Status: Complete. Dependencies: UI lifecycle, foundation.

Scope: bounded localStorage saved routes, remove/undo, oldest replacement
confirmation, manifest, icons, install hint, local fonts, dark/high-contrast and
reduced-motion styles, and explicit no-service-worker limitation.

Tests/commands: `npm test -- src/lib/storage/journeys.test.ts src/app/manifest.test.ts`.

Done: malformed storage is harmless and install guidance never claims offline
support. STOP if an icon or manifest becomes unowned or misleading.
Maintenance: preserve 44px controls and keyboard/focus behavior.
