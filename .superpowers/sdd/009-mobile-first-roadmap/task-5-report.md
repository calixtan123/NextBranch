# Task 5 report — Deterministic real-browser mobile coverage

Status: complete. Base: `1ec11d8e9d2faa673ead07a0687f7c33e059f06c`.
Implementation and verification performed only in the mobile-first-roadmap worktree.
No application source changed and no subagents were dispatched.

## Decisions and scope

Read the installed Next.js 16.3.5 App Router Playwright testing guide and deployment
guide before configuring the server. They recommend testing the production build
and explain `next build` followed by `next start`.

- Added development dependencies `@playwright/test` 1.63.0 and
  `@axe-core/playwright` 4.13.0, with the npm lockfile. Axe is Deque's supported
  integration, used to scan the actual browser-rendered screens.
- Added `test:e2e`, a minimal `playwright.config.ts`, and a production server on
  `127.0.0.1:3100`. Existing servers are not reused, avoiding accidental testing of
  another checkout. Two workers bound resource use; no automatic retries mask
  failures. Build is explicit, allowing CI to build once before running tests.
- Mobile Chromium uses Pixel 7 settings and mobile WebKit uses iPhone 13 settings,
  both at 390×844 by default. The layout/accessibility scenarios explicitly cover
  320×844 and 390×844 in each engine.
- Time is fixed to `2026-09-18T12:00:00.000Z` with London timezone and en-GB locale.
  Timers retain their normal behavior. This stabilizes arrival countdowns while
  allowing hydration, navigation, and network events to run naturally.
- Each test has its own browser context and therefore separate local storage.
  The saved-route test saves through the real interface, then performs a new
  page load in that same context; no init script clears its saved route.
- A single context-level route interceptor fulfills both APIs and refuses any
  unexpected API request or external origin. Fixtures include all returned
  snapshot fields and full normalized train fields, including nullable and
  non-rendered fields. No TfL key is needed. The server explicitly receives an
  empty key, overriding local environment files, so a missed mock cannot invoke
  credentialed upstream requests.
- The GitHub Actions workflow uses Node 24, read-only repository permissions,
  `npm ci`, `npx playwright install --with-deps chromium webkit`, `npm run verify`,
  `npm run build`, and `npm run test:e2e`. It does not reference secrets.
- Failure screenshots/traces are retained locally in ignored `test-results/`.
  No operating-system home-screen automation was added.

## Scenarios and production regressions caught

Each test states its regression before its body. The 16 scenarios run in both
engines, for 32 tests total.

| Scenario | Regression caught |
| --- | --- |
| Production entry smoke | Broken entry/hydration prevents the station picker appearing. |
| Station selection and departures | Wrong station URL, missing platform grouping, wrong countdown/local time, or lost unknown-platform information. |
| Direct journey and saved reopening | Submission stops showing results, save does not persist, or reopening no longer activates the saved pair. |
| Browser back/forward | The URL changes but the app keeps displaying the previous station/journey. |
| Initial failure and retry, both views | Error state hides the retry action or cannot recover when the API recovers. |
| Refresh failure and stale retention, both views | A failed refresh discards previous predictions or displays stale predictions as current/ranked. |
| Offline and reconnect, both views | Network loss leaves current-data claims visible, discards predictions, or reconnect does not recover. |
| Empty predictions, both views | A valid empty response shows a generic error or misleading train. |
| Keyboard selection/focus/submission | Arrow/Enter selection loses focus, Tab cannot move between inputs, or Enter does not submit. |
| Four views at 320px and 390px | Long destination text, open options, result cards or saved rows extend past the viewport; detectable accessibility rules fail. |
| Manifest and icons | Installation metadata becomes undiscoverable, icons go missing, or PNG dimensions no longer match their advertised sizes. |

The accessibility scenarios scan departures, search with an open suggestion
list, results, and saved journeys with WCAG 2/2.1 A/AA tags. The overflow assertion
checks both document scroll width and the bounds of visible main-region content.
Assertions use roles, accessible names, displayed content, URL state, focus, and
actual static resources. They do not inspect React/Next private state.

## RED → GREEN and debugging evidence

1. Wrote the production-entry browser smoke test first.
2. Ran `npm run test:e2e -- --grep 'opens the departure station picker'` before
   adding the script/configuration. Expected RED: exit 1, `Missing script:
   "test:e2e"`. This proves the requested test invocation path was absent; it is
   not claimed as a production app defect.
3. Installed dependencies, added the production-server configuration, installed
   browsers, and built the app.
4. The focused smoke then passed in Chromium and WebKit: `2 passed (13.6s)`.
5. The first full browser run returned 15 passes and 17 failures. Sixteen failures
   came from broad alert selectors also matching Next's hidden route announcer.
   Scoping those assertions to the application's `main` region fixed the test
   boundary. The remaining WebKit failure was an assumption that native Tab
   traversal always includes buttons. The final keyboard scenario verifies
   app-controlled combobox selection, focus movement between inputs, and Enter
   form submission, without imposing a browser/OS button-navigation preference.
   No production behavior was changed to satisfy either test assumption.
6. Focused error/offline/empty/keyboard run after correction: 18 passed.
7. Fresh verification/build and complete browser suite passed; see below.

## Commands and observed output

Local runtime: Node v25.8.0 / npm 11.11.0 on macOS arm64. CI is configured for
Node 24; the hosted CI job was not executed in this task.

```text
npm install --save-dev @playwright/test @axe-core/playwright \
  --cache /tmp/northern-direct-npm-cache --fetch-retries=0 --fetch-timeout=20000
Sandbox attempt: ENOTFOUND registry.npmjs.org.
Permitted escalation: exit 0; added 4 packages; audited 464 packages.
```

The install reported two moderate dependency vulnerabilities; no broad dependency
upgrade was attempted as part of this browser-testing task.

```text
npx playwright install chromium webkit
Permitted escalation: exit 0.
Installed Chromium 153.0.8010.12 / Playwright revision 1243,
Chromium headless shell 1243, WebKit 26.6 / revision 2359.
```

The unprivileged install initially stalled while attempting to use Playwright's
normal user cache and was stopped. The successful permitted install used that
normal cache. The first unprivileged browser test was blocked by
`listen EPERM: operation not permitted 127.0.0.1:3100`. Permitted browser-test
execution resolved that environment restriction. No automatic approval rejection
or remaining sandbox blocker occurred.

```text
npm run test:e2e -- --grep 'failure|failed refresh|offline|empty|keyboard'
18 passed (6.4s); exit 0.

npm run verify
TypeScript: pass.
ESLint: pass.
Test Files 23 passed (23).
Tests 161 passed (161).
Duration 1.61s; exit 0.

npm run build
Next.js 16.3.5 (Turbopack).
Compiled successfully; TypeScript completed.
Generated all 4 static pages.
Routes: /, /_not-found, /api/departures, /api/journey, /manifest.webmanifest.
Exit 0.

npm run test:e2e
Running 32 tests using 2 workers.
16 mobile-chromium passed; 16 mobile-webkit passed.
32 passed (12.9s); exit 0.

git diff --check
Exit 0.
```

Browser executions emitted the environment's harmless `NO_COLOR`/`FORCE_COLOR`
warning. No tests were skipped and no retries were used. Real browser offline
events worked in both engines without synthetic events or API monkey-patching.

## Files

- `package.json`, `package-lock.json`: command and development dependencies.
- `playwright.config.ts`: isolated server, two mobile projects, diagnostics.
- `e2e/fixtures.ts`: typed snapshots, time and request isolation.
- `e2e/mobile.spec.ts`: 16 scenarios, each run in both projects.
- `e2e/README.md`: setup, focused runs, contracts and limitations.
- `.github/workflows/verify.yml`: Node 24 verification/build/browser CI.
- `.gitignore`: browser output artifacts.
- This report.

## Self-review and remaining limits

- Checked the requested coverage against the brief; all requested browser checks
  are present and passed. Application source and existing unit tests are unchanged.
- Fixtures are handwritten API responses, not generated by production logic, so
  expectations are independent. Exact supported request pairs prevent a broken
  query from accidentally receiving a success fixture.
- Browser state is isolated across tests; route interception is installed before
  navigation. All external browser requests fail closed.
- CI browser/system-library installation is explicit; no secret is passed through
  workflow configuration. Node 24 CI configuration is present but hosted Linux
  execution remains unobserved until the workflow runs.
- Automated accessibility scanning does not prove full accessibility. Real phone,
  assistive-technology and operating-system installation checks remain manual.
- The browser tests cover the frontend contract using fixed API snapshots. The
  existing route/unit tests cover server parsing and TfL integration behavior;
  these E2E tests deliberately do not call live TfL.
