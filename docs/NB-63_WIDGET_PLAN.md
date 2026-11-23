# NextBranch Home Screen widgets

The first version lets iPhone testers switch between saved platform departures in one Home Screen widget without buying anything. The production version makes Home Screen departure boards a paid feature. The in-app Home cards set the platform order and appearance. [NB-63](https://synapse21.atlassian.net/browse/NB-63)

## Development prototype

- Add one medium **Saved Platforms** widget. Use its up and down buttons to cycle through the saved cards in Manage Platforms order. The selected platform stays selected when cards move and falls back to the first card if removed. iOS handles vertical swipes for system widget stacks. WidgetKit exposes tap controls inside an individual Home Screen widget.
- Each page reserves the same space for the station, platform and direction, three departure rows, and footer. The heading uses the app card’s system font and coloured line marker. A long station name can use the full heading width, with the line label beside the platform below it. Amber uses orange dot-matrix destination text where it fits. Modern uses blue Gill Sans type and row dividers. Each page follows its card’s effective style in the app.
- The extension uses the same departures API as the app when iOS wakes it, even while NextBranch is closed. It deduplicates saved platforms at the same station, requests another automatic read after 15 minutes, and honors `Retry-After`. The refresh button requests an immediate read subject to the server’s retry window and a 30-second cooldown.
- The timeline removes trains after their predicted times and shows “Waiting for fresh departures” once the source data is 60 seconds old. The footer dot is green for fresh data and amber when fresh data is unavailable. VoiceOver reads the status. The widget can spend time waiting between refreshes, especially on a real phone where iOS manages the refresh budget.
- The extension is opt-in for local development. The standard release configuration omits the extension, and a release build explicitly rejects the prototype flag.

## Run the prototype

From `native/`, run the following in a development checkout. The first command regenerates the ignored Xcode project, so use a checkout where you can discard its generated `ios/` folder. The fixture uses synthetic A/B platform labels and a fixed departure clock.

```bash
export EXPO_PUBLIC_NEXTBRANCH_WIDGET_PROTOTYPE=1
export EXPO_PUBLIC_NEXTBRANCH_FIXTURE=three-card-home
export EXPO_PUBLIC_NEXTBRANCH_SEED=1
npx expo prebuild --clean --platform ios
npm run ios
```

1. Open NextBranch and wait for all three boards to load. If you have multiple simulators, add `-- --device "NextBranch Widget Test"` to `npm run ios` to target the dedicated simulator by name. To try real saved platforms, unset the fixture and seed variables, set `EXPO_PUBLIC_NEXTBRANCH_API_URL` to the live API origin, and restart the development server.
2. On the iPhone Home Screen, hold an empty area, choose **Edit** and **Add Widget**, then search for **NextBranch**. Add **Saved Platforms** once. Remove any earlier numbered prototype widgets from the Home Screen.
3. Return to the Home Screen and tap the down button through all saved platforms. Tap up to go back. Check heading fit, board size and appearance against the saved cards. Reorder a card and check that it remains selected. Remove that card and check that the widget selects the first saved card.
4. Use a reachable API origin and real saved platforms to test extension-initiated refresh. Close NextBranch and check the widget after an automatic wake. Try the refresh button, a failed response, and a fresh response with no trains. The built-in fixture tests paging and appearance with illustrative data and disables widget network requests.

WidgetKit decides when to run a requested refresh and draw the latest status. [Apple’s widget update guidance](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) · [Apple’s interactive widget guidance](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)

## Single-widget simulator verification

- On 23 November 2026, `npm run typecheck` and `npm test` passed in `native/` with 564 tests across 23 files. The `NextBranch` Debug simulator build succeeded and included the widget extension.
- The Home Screen test passed on **NextBranch Widget Test** (iOS 27.2). It paged through four saved platforms in both directions, displayed Amber and Modern in the same footprint, and showed the full “Cutty Sark for Maritime Greenwich” heading, the longest name in the station inventory, alongside three departure times. The manual refresh button fetched departures while the app was closed.
- In a separate simulator run, the iOS activity scheduler started the extension at 12:19 GMT without a widget tap. The extension fetched both requested stations from the local test API and iOS scheduled its next refresh. Live TfL behaviour and refresh frequency on a physical iPhone remain unverified.

## Earlier stack prototype verification

- On 23 November 2026, `npm run typecheck` and `npm test` passed in `native/` with 560 tests across 23 files. Tests cover saved order and removal, departure and board expiry, empty and unavailable data, and a successful refresh under the fixed fixture clock.
- The Debug simulator `xcodebuild` for the `NextBranch` scheme succeeded and packaged the widget extension. A development iOS bundle export also passed after the publisher refresh fix. A direct check of `app.config.js` confirmed that the release configuration omits the extension and rejects the prototype flag.
- On **NextBranch Widget Test** (iOS 27.2), NextBranch launched and iOS registered the extension and received refresh requests for all three widget types. A fresh read of the shared App Group preferences confirmed three distinct fixture timelines for Colindale A, Camden Town A and Camden Town B. Each contained three departures and a final “Open NextBranch to update” entry.
- All three panels were installed on the **NextBranch Widget Test** Home Screen. Colindale A and Camden Town B matched their Amber cards, and Camden Town A matched its Modern card. The widgets showed the update prompt after expiry, and reopening the app restored the test departures. Device Hub could not complete the drag into a stack, so manual swiping remains unverified. The simulator used illustrative departures. A live TfL check on a physical iPhone remains open in NB-63.

## Paid release

1. **Measure Home Screen usefulness on a physical iPhone.** Use the widget during realistic trips. Record how often it shows fresh departures when the app is closed, how long stale rendered entries remain visible, and how quickly the widget updates after a button tap or app visit. Agree on a minimum usefulness target before charging. If the system refresh budget makes a worthwhile Home Screen experience impractical, keep this feature in development.
2. **Verify access with StoreKit 2.** Add the App Store product after deciding the price and purchase model. The app derives widget access from verified transactions. It refreshes that access after launch, resume, purchase, restore, and transaction updates. Pending, unknown, expired or revoked access shows a locked widget and removes published departure data. Use StoreKit’s restore flow for users who switch devices. Exercise free, purchased, restored, pending, expired and refunded states in the StoreKit test environment. [StoreKit transaction entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
3. **Enforce access in the extension.** Store a minimal, versioned access record and widget snapshot in the iOS App Group, a folder available to the app and its widget. Gate both publication and the extension’s timeline generation, with a bounded validity period for cached access. Clear departure timelines and request a redraw on access loss. A locked widget can appear in the iOS gallery and link to the in-app purchase or restore screen. For an active purchase, link to the currently saved platform using its validated identifier so the app opens the correct departure board. Verify the signed app and extension use the same App Group. [Apple’s App Groups guidance](https://developer.apple.com/documentation/xcode/configuring-app-groups)
4. **Validate the capacity for extension refresh.** Continue to request station snapshots through the shared backend, preserve the original fetch time, and honor the shared limit and retry timing. Keep the TfL key server-side. Include simultaneous refreshes, fallback traffic, outages and delayed timelines in the one-key capacity work. Gate rollout on the verified TfL allowance, measured freshness and demonstrated headroom for foreground boards. [NB-57 capacity validation](https://synapse21.atlassian.net/browse/NB-57) · [NB-61 staging load test](https://synapse21.atlassian.net/browse/NB-61)

Before release, verify an entitled widget and locked widget on a physical iPhone. Cover offline access, a refund after a widget is already installed, a removed or reordered platform, light and dark appearance, and VoiceOver. Record the signed build, observed refresh delay and practical departure freshness alongside the purchase checks.
