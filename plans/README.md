# Northern Direct delivery plan

This is the maintained eight-phase plan. Status is based on repository evidence
and the current verification record, not an invented historical transcript.

| Phase | File | Status |
| --- | --- | --- |
| 1 | `001-foundation.md` | Complete |
| 2 | `002-tfl-discovery.md` | Complete for recorded snapshot; credential-gated live rerun NOT RUN |
| 3 | `003-boundary-normalization.md` | Complete |
| 4 | `004-topology-matcher.md` | Complete |
| 5 | `005-journey-api-eta-ranking.md` | Complete |
| 6 | `006-ui-request-lifecycle.md` | Complete |
| 7 | `007-saved-pwa.md` | Complete |
| 8 | `008-release-verification-docs.md` | Complete for automated checks; manual/live checks NOT RUN |

Run `npm run verify` and `npm run build` after changes. STOP if a safety rule
would require guessing a route, platform, identity, or destination ETA; preserve
the last safe result and document the uncertainty. Maintenance owners should
refresh the discovery snapshot and its date before the bundled topology expires.
