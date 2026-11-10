# NB-3 UI follow-up independent review

## Scope and evidence

Reviewed `/private/tmp/nb3-ui-refinement-plan.md`, `/private/tmp/nb3-ui-refinement-report.md`, and `/private/tmp/nb3-ui-refinement-review.diff`, plus the current implementations of Manage, Surface, the theme, Search, PlatformBoard, and the preference owner. Inspected the installed React Native 0.88.1 PanResponder and ScrollView implementations to check responder behavior. No source changes or test reruns were performed.

Accepted the implementer's recorded verification evidence of 38 passing native tests in nine files, passing TypeScript checking, passing iOS export, and passing `git diff --check`. Latest-head remote CI and native visual acceptance remain the parent's responsibility.

## Spec verdict

**PASS for the implementation review. No blocking spec findings.**

- Manage claims the initial touch on the handle, locks its parent ScrollView during the gesture, rejects responder termination requests, follows the vertical displacement visibly, and restores scrolling after release, cancellation, or active handle unmount.
- The target calculation uses row-local `onLayout` coordinates and measured heights. These layout measurements exclude the visual translation. Variable-height rows therefore keep stable centers during a drag, and a single gesture can move across multiple positions.
- Reorder persistence occurs on release through the existing preference transaction. It retains the original card object and style. Cancellation and stale release after unmount do not commit. No preference implementation changes affect identity, Undo, or replacement behavior.
- Tap suppression considers both axes and remembers movement that returns to its origin. Accessible Move up/down and the alert fallback remain available. Handle and action targets retain a 44-point minimum.
- Home board bottom spacing increases from 10 to 18 points, while expanded-board spacing remains 10. ScrollView, keyboard behavior, text scaling, and the two palettes remain available.
- Surrounding menus, search, and actions adopt system typography and blue actions. Departure labels explicitly retain their Avenir faces and prior weights, while Amber/Modern train rendering remains untouched.

The prior manual gates remain open. Mocked responder callbacks cannot establish native finger gesture arbitration or VoiceOver behavior. The report explicitly discloses that limitation and the lack of drag auto-scrolling. With a three-card limit and accessible move controls retained, the latter does not contradict the requested implementation scope.

## Code quality verdict

**PASS. No blocking correctness or maintainability findings.**

- The callback refs keep the stable responder connected to current props and current card order.
- The active-gesture guard prevents a release after cancellation-by-unmount from saving an old destination.
- `onPanResponderTerminationRequest` returning false is the correct React Native callback for rejecting JS responder transfer. The enclosing `scrollEnabled` prop additionally suppresses native scrolling during the active drag. `onShouldBlockNativeResponder` is consistent with Android responder arbitration.
- The existing preference owner centralizes movement and serialized persistence. The change preserves its transaction and error-reporting behavior.
- Regression coverage checks the actual Manage callbacks against the real preference owner, including variable row heights, multi-position movement, one persistence write on release, cancellation, cleanup, accessible moves, and horizontal movement tap suppression. Boundary mocks and manual rerendering limit what those tests prove, as the implementation report acknowledges.

## Nonblocking scope observation

The shared `Action` restyling also reaches PlatformBoard's exceptional-state Retry and Review selection controls at `native/src/PlatformBoard.tsx` lines 209–211. Those controls now use the new system-font action treatment. Departure headings, metadata, and train typography retain their prior rendering. Include an error-state card in the parent's visual review if the intended preservation boundary includes these controls.

## Summary

Spec has zero blocking findings. Code quality has zero blocking findings. Native gesture and accessibility acceptance, visual review, and latest-head CI remain open release gates.
