# NB-3 native NextBranch UI

## Spec

Binding specification: docs/design/NB-3-spec.md (re-fetched Jira NB-3 on 9 November). Pinned MagicPath complete editable files are in docs/design/nextbranch-magicpath-reference.json. Preparation pack: /Users/calixtan/Documents/ChatGPT/TFL Arrivals App/docs and fixtures.

## Global Constraints

- Implement the native iPhone UI visually identical to the pinned MagicPath design, apart from required production correctness/accessibility adaptations. Use real safe areas; no fake status bar, bezel or home indicator.
- Framework decision: React Native with Expo and TypeScript, iPhone only, iOS 16+ (or Expo's supported minimum if higher), bundle identifier com.nextbranch.app. Use a compatible stable SDK; record supported OS. No Android launch or signing/deployment.
- Preserve existing web app and server. Reuse pure existing decoder, canonical station search, countdown and route helpers where they fit. Native has independent package/lockfile to avoid React Native/Next version conflicts.
- Zero to three unique ordered exact station/platform/direction selections; initially empty. Versioned validated durable preferences; explicit replacement; five-second Undo merges with intervening edits. Per-card overrides survive global styles.
- One lifecycle per distinct station, exact decoder identity; 20s deadline including body, 10s manual cooldown, server interval/30s fallback, shared 429 maximum deadline, background pause/resume, stale age >30 seconds or matching failure/offline. Keep failure until successful retry.
- Physical platform catalogue cannot be invented or inferred from predictions. Fixture A/B is explicitly synthetic and isolated. Unknown live catalogue remains recoverable and explains why selection is unavailable.
- Tests verify behavior and errors. UI supports 44-point controls, text scaling/wrapping, semantic labels/selected states, non-drag reorder, dark/light, keyboard/landscape, no ticking VoiceOver announcements.
- No secrets, live TfL credentials, App Store publication, merging, or unrelated changes.

## Task 1: Native application, durable state, and station lifecycle

Read docs/design/NB-3-spec.md in full. This task owns native/ plus minimal root tooling/CI/documentation needed to verify the native app. Implement the complete eight-screen flow: Home, Platform departures, Search stations, Select platform, Manage/Replace platforms, Settings, Appearance, Card display. Keep native presentation, preference owner and station request owner in separate readable modules.

Read the exact pinned generated component out of docs/design/nextbranch-magicpath-reference.json (editableFiles) for spacing, all screen markup, tokens, dot-matrix glyph font and board row rules. Port the actual glyph map/renderer to native SVG dots or another precise native approach; a generic monospace font is not a visual match. Allow accessible text fallback/reflow at large type without losing destination/branch. Use the same effective board style on Home/detail; match colors, borders, row heights, padding, and icons. Do not redesign.

Build an independently installable Expo native package with scripts for start/ios, typecheck, behavioral tests and static iOS bundle export; include lockfile. Native tests may use Vitest for pure TS and React Native component tests if compatible. Reuse existing pure source via relative imports or a minimal Metro watchFolders mapping, not copies of server algorithms. Avoid changing server APIs. Use maintained AsyncStorage, safe-area-context and SVG packages if needed. Choose the stable compatible Expo SDK and install dependencies with Expo's alignment tool.

Implement atomic capacity/identity/reorder/remove/Undo/replace operations in one preference owner. Validate persistence schema and catalogue tuples, restore valid records without destructive writes for unknown versions; read/write failures show usable-session warning; serialize async writes to prevent old state winning. Search all canonical Northern names/aliases offline and persist last two distinct stations. Unknown catalogue provides a recoverable explanation; no guessed mappings.

Implement a testable station-keyed coordinator, injected transport/clock/storage as appropriate, shared by Home and detail. Do not create per-card request hooks. Retain useful snapshots in memory, derive exact platform rows using expectedArrival and existing Due behavior, expire before limit 3/5, preserve all advertised branches and missing-field fallbacks. Unknown platform predictions get a separate detail notice. Protect late responses and pause/release owners offscreen/background. Announce manual refresh completion once. Expose proper loading/empty/offline/stale/error/updating/retry states. Production absolute API URL must be configured with HTTPS outside dev; no shipped localhost/default or public TfL secret.

Create development-only deterministic fixture transport at 2026-09-16T12:00:00.000Z using preparation pack's platform-cards fixtures. It must never fall through to real fetch, and fixture catalogues/seeding must be development-only and clearly labelled synthetic. Normal install stays empty. Provide developer entry via explicit environment configuration (no sample switches in customer settings), with screenshot navigation seeded to the three design cards if explicitly requested by dev config. Fixture transport should support Colindale/Camden and isolate errors. Frozen clock in dev screenshots; controllable clock in tests.

Verification: test identity/capacity/races/Undo interleavings/persistence errors, matching/filter/expiry/Due/large text fallback logic, six=>3/5 rows, two distinct station calls for three cards, fresh-detail reuse, independent errors, timeout including body, malformed/wrong identity, age boundary, stale retry, shared 429 and in-flight success, background/resume and late removed responses. Start with meaningful failing tests for new state/coordinator logic, then implement. Run native typecheck/test and iOS static export; run root npm run verify and build if root config changed. Add native checks to CI without weakening existing checks. Record exact commands/results and material device/live-catalogue limitations in docs/design/NB-3-verification.md.

Do not start persistent servers, do not push, and do not spawn subagents. You are not alone in the codebase: preserve others' edits. Parent owns git operations. Write full report including TDD red/green evidence to .superpowers/sdd/2026-11-09-NB-3-native-ui/task-1-report.md; final reply only status, file paths, verification summary and material concerns.
