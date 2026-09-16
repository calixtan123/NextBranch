# Learning notes for a Python developer

These notes explain the choices in the current repository, rather than giving
generic language documentation.

## TypeScript types and Zod

Type annotations describe compile-time intent, much like Python type hints.
`Station` in `src/lib/northern/stations.ts` is an object shape; a TypeScript
`interface` would be another way to name an extendable shape. Unions such as
`"bank" | "cx" | "both"` and `JourneyTrain["evidence"]` restrict values more
tightly than a broad `str`. Types disappear at runtime. `src/lib/northern/schemas.ts`
uses Zod to validate untrusted TfL JSON at runtime and infer matching types.

🚩 A type assertion (`as Foo`) does not validate data. Keep assertions at known
boundaries and prefer `safeParse` for API responses.

## Async JavaScript

`async` functions return Promises, not values immediately. `await` makes one
Promise readable in sequence; `Promise.allSettled` in
`src/app/api/journey/route.ts` lets destination and timetable failures degrade
independently. Fetch uses an `AbortController` in
`src/components/useJourneyRequest.ts`.

🚩 A rejected Promise must be handled, and an aborted request must not update
React state. Avoid accidentally starting a request during render.

## React components, props, state, and hooks

`TrainCard.tsx` is a presentational component receiving props. `Home.tsx` owns
state (`useState`), derived values (`useMemo`), side effects (`useEffect`), and
stable callbacks (`useCallback`). `useJourneyRequest.ts` is a custom hook that
encapsulates fetch, polling, aborts, and keyed cached data.

🚩 Effects run after render and can run more than once in development. Always
return cleanup for timers, listeners, and in-flight work.

## Client/server components and App Router

`Home.tsx` is a client component because it needs browser events and storage.
`src/app/page.tsx` is the App Router page entry. `src/app/layout.tsx` is the
root layout and owns metadata/font setup. `src/app/api/journey/route.ts` is a
server route handler and can safely import the `server-only` TfL client.

🚩 Do not import server-only modules into a client component or expose secrets
through `NEXT_PUBLIC_*`. Keep the boundary explicit.

## Environment variables

The server reads `process.env.TFL_API_KEY` in `src/lib/tfl/client.ts`.
`.env.example` documents the name and `.env.local` supplies a local value.
Vercel stores environment variables in project settings, separately for Preview
and Production.

🚩 Environment variables are strings and may be missing. The client turns a
missing key into a configuration error; it must never log the value.

## localStorage and caching

`src/lib/storage/journeys.ts` stores at most eight saved routes in browser
localStorage and treats storage as best-effort. The API marks every response
`Cache-Control: no-store`; the TfL client uses Next's 12-hour server cache for
topology/timetable and uncached arrivals. The bundled topology is a bounded
fallback.

🚩 Browser localStorage is user-controlled and can be malformed. Parse and
validate it before use. A cache is not proof that live data is current.

## PWA manifest

`src/app/manifest.ts` declares standalone display and the three PNG icons in
`public/icons/`. There is deliberately no service worker. This means install
metadata works, but offline navigation/data caching does not.

## Vitest versus pytest

Vitest is the JavaScript analogue of pytest; Testing Library tests render UI in
`jsdom`. Domain tests sit beside their modules. Most tests follow Arrange,
Act, Assert: create a fixture, invoke the function or click a control, then
assert the public outcome. `src/app/api/journey/route.test.ts` injects network
dependencies, so it is deterministic and not a live integration test.

🚩 Do not assert implementation details when a safety outcome is observable;
do not accidentally let a test reach TfL.

## Vercel

Vercel builds this Next.js app and hosts static frontend output plus the route
handler. Git integration creates Preview URLs for pushes/PRs; Production is a
separate environment. Build behavior is represented by `npm run build` and
deployment guidance is in `README.md`.

🚩 Preview credentials, HTTPS, browser behavior, and live TfL behavior need a
separate authenticated verification pass; local mocked tests cannot prove them.
