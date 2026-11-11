# NB-15 live-board card hierarchy

Ticket: https://synapse21.atlassian.net/browse/NB-15
Parent branch: feat/NB-14-line-platform-groups at e668e9c.

## Global Constraints

- Direction and platform number must be the prominent combined heading on saved and expanded cards. Use the native system font for card chrome; preserve Amber matrix and Modern departure rendering.
- Preserve station identity, line markers, exact platform selection, shared memberships, saved state and navigation.
- Remove repeated routine metadata and empty destination placeholders from both visible and accessible card summaries. Preserve material limitations: National Rail exclusion, unsupported/unverified service mappings, outages, empty feeds, stale/offline/rate limits and missing number/direction.
- Preserve real advertised destinations and full catalogue source data. No backend/catalogue changes or unrelated redesign.
- Allow wrapping and Dynamic Type; verify both themes and both board styles. Do not start or terminate shared servers.

### Task 1: Refine platform board typography and concise coverage

Own native/src/PlatformBoard.tsx and native/tests/platform-board-layout.test.ts, with minimal related native test adjustments only if required. Trace the existing Label system font and platformPickerTitle formatter before editing. Reuse the direction-first formatter where appropriate. Make the direction/platform heading high-contrast and prominent (approximately 19pt bold), station a readable secondary identity (approximately 14–15pt). Keep line markers readable and allow header stacking at larger font scales. Remove Avenir Next overrides from board chrome while preserving departure styles. Remove the unconditional friendly-name/scope/service-success footer. Show a concise footer only for actionable coverage caveats, omitting Towards not published and routine Live departures available; retain real destination wording when needed to distinguish limited services. Keep meaningful mixed National Rail and partial feed warnings visible and accessible. Deduplicate accessible descriptions consistently. Update existing layout and coverage tests to assert the desired behavior, including a fully supported real Baker Street platform having no redundant footer, shared mixed coverage, source blanks, stale/outage cases, font scaling and style/theme cases. Run native typecheck, full native tests and iOS export; record commands and results in report. Do not commit or push (controller owns git). Do not spawn agents.

Controller verifies on running iPhone simulator, obtains task and fresh whole-branch reviews, publishes PR into parent feature branch, waits for all current-head CI, and records Jira result.
