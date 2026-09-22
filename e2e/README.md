# Mobile browser checks

These tests run the built Next.js app in Chromium and WebKit using phone-sized
browser contexts. Playwright drives the real interface; axe checks the rendered
pages for automatically detectable WCAG A/AA accessibility violations.

Use Node 24 to match CI:

```sh
npm ci
npx playwright install chromium webkit
npm run verify
npm run build
npm run test:e2e
```

On Linux, install browser system libraries too:

```sh
npx playwright install --with-deps chromium webkit
```

Playwright starts and stops the production server on `127.0.0.1:3100`. The port
must be free; it never reuses a running application. Rebuild after changing app
code. No TfL key is required: the server gets an empty `TFL_API_KEY`, and browser
requests to both app APIs are intercepted with complete fixed snapshots.
Unexpected API and external requests fail the test instead of reaching TfL.

Every test has fresh cookies and local storage. The persistence test saves via
the interface and reloads within that same context. Browser time is fixed at
18 September 2026, 13:00 London time; timers still run normally so React and
browser navigation retain their normal scheduling.

Each scenario's `Regression:` comment states the user-facing break it catches.
The suite covers station selection, platform information and arrival times,
direct journeys, saved journeys, deep-link history, failed loads and retry,
stale predictions, offline/reconnect, empty results, keyboard selection and
focus, manifest/icon availability, and four-view accessibility and overflow at
320px and 390px. All scenarios run in both engines.

For a focused run:

```sh
npm run test:e2e -- --grep 'back and forward'
npm run test:e2e -- --project=mobile-webkit
```

Failures save screenshots and traces in ignored `test-results/`. Open a trace
with `npx playwright show-trace <trace.zip>` to inspect the browser actions.
Tests have no automatic retries so regressions remain visible.

This checks browser-level behavior, not operating-system installation. Real
device testing, assistive-technology testing, and manual home-screen installation
remain necessary; an automated axe pass does not prove full accessibility.
