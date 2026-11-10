# NB-3 final glass-controls and integration review

Reviewed 10 November 2026. Independent read-only review of the current worktree, including the untracked GlassControls module and focused tests. No implementation edits, suite reruns, commits, UI interaction, or subagents.

## Independent verdicts

- **Specification: PASS for the bounded implementation.** The white/neutral Dark controls, dark Light foregrounds, effective-majority accents, official native material, readable accessibility fallback, and scoped integration meet the follow-up requirements. The reported Dynamic Type blocker is resolved in source and supported by the supplied maximum-size Home capture. Whole-ticket native acceptance remains incomplete.
- **Quality: PASS.** No new actionable blocking correctness, regression, security, or maintainability finding was established. The addition is narrow and uses existing preference and navigation owners. The existing draft-PR/manual-acceptance gates remain in force.
- **Blocking source findings: 0.** This review does not authorize marking NB-3 Done or making PR #4 ready.

## Scope and integration evidence

Read the refinement plan, NB-3 specification, current implementation report and both rounds of task review, and prior whole-branch, typography and theme audit reports. Used the whole-branch review package as an inventory and independently inspected current GlassControls, preferences, Home, Search, theme, screen context, App, Manage, runtime, API, station owner, board projection, dependency delta, focused tests and shared/CI changes. Prior completed visual and behavioral work was retained as prior evidence rather than rerun.

The package compares the branch directly with current main. Main has advanced through NB-4 commits `f4d4c8d` and `50c2ba2`; apparent catalogue/README removals in that comparison are main-only additions, not NB-3 deletion commits. The verified merge base is `0dd90324c186578ee8b05243fcead93009d32d4d`. No catalogue-removal regression is inferred from that two-tip diff.

`majorityStyle` uses `effectiveStyle` on the current snapshot; global modes win, Custom ties/default overrides resolve to Amber, and empty global Modern remains Modern. It introduces no persistent derived state. The Home controls retain navigation and capacity behavior; Search retains the controlled input, clear callback, keyboard dismissal and station-selection flow. The shared Action/TextAction styling and board projection are unchanged by this refinement.

GlassSurface uses both installed availability checks, begins with an opaque fallback, handles failed initial accessibility reads, ignores stale initial results after setting changes, and removes its listener. The official SDK 58 dependency is locked at 58.0.5 from the npm registry with integrity metadata and adds no transitive dependency delta. The native decorative view does not intercept touches or expose accessibility descendants. Foreground colors and explicit native colorScheme follow the current interface palette, including the saved theme override. The tint/rim carry the accent. GlassAction retains labeled button semantics, disabled handling, 44-point minimums and scalable unlimited text with bounded/shrinkable layout.

Broader source integration remains coherent: station ownership deduplicates IDs and guards late responses, snapshots are validated before projection, platform/direction filtering and expiry precede row limiting, fixture transport is development-gated and stored separately, and preference transactions preserve tuple identity/capacity/style behavior. The new control code does not change those owners or the existing drag transaction. No new network endpoint, credential handling or server behavior was introduced. The shared station search sort acts on the fresh filtered array; the root alias conversion is a safe file-URL conversion. Native CI includes dependency installation, types, tests and iOS export.

## Independent screenshot observations

Inspected the following supplied native screenshots directly. Parent identifies the run as iPhone 17e / iOS 27.2, current worktree served by temporary Metro on port 8082. This reviewer did not independently drive the simulator or inspect its process state.

- `/private/tmp/nb3-glass-home-current.png`: Dark Amber Home shows white/neutral Manage platforms and Add a platform text plus a white add icon, restrained warm rims, and visible native-material shading. Labels fit without clipping at the shown ordinary size. The Amber departure card remains readable and fixture disclosure is visible. The developer gear overlays the header Search control, so this image does not establish an unobstructed ordinary-size Search icon or its hit testing.
- `/private/tmp/nb3-glass-home-max-type.png`: Manage platforms wraps to two complete lines within the available horizontal bounds and its material grows vertically; Settings moves below it. The Search icon is visible in its own glass control. The large title wraps, and the saved heading/count and beginning of the board remain within horizontal bounds. This supports the concrete scalable-label fix. The capture is only the top viewport: Add a platform, full departure rows, bottom controls and scroll reachability at this size are not established by this still image.

These observations establish a rendered Dark/Amber sample and the specified Manage wrapping correction. They do not establish light/Modern contrast, Search text selection, touch behavior, glass animation/performance or native accessibility operation.

## Verification evidence and exact limitations

The inspected log tails show 59 native tests in 11 files and 260 root tests in 34 files passing. The implementation report records successful native typecheck, iOS export, root verification and diff checking, plus a failing width regression before the fix. The parent additionally confirms current native tests (59), typecheck and iOS export all exited zero after recovery. This reviewer did not rerun green suites. The native build log explicitly reports ExpoGlassEffect compilation/packaging and `Build Succeeded`; it subsequently reports an osascript Simulator/DeviceHub activation error. The parent separately reports successful installation and launch, and supplied the screenshots above. Accordingly, the build succeeded, but the entire Expo build-and-launch command must not be described as cleanly successful solely from that log.

Outstanding boundaries:

- Parent reports CUA window lookup/timeouts prevented the current Light, Modern, Search and Reduce Transparency native walkthrough. Source and shallow mocked tests cover these paths; they are not equivalent to native interaction/rendering evidence.
- Current maximum-size evidence covers the top of Dark/Amber Home only, not the full small/large device, landscape, keyboard and text-size matrix.
- Header Search at ordinary size is partly obscured by the development overlay. Native hit testing and unobstructed ordinary-size rendering remain unobserved in this review.
- Native Reduce Transparency transitions, unsupported-iOS fallback, VoiceOver focus and spoken output, and physical-device glass appearance/performance remain unverified here.
- Existing updated finger-drag, audible refresh announcements, time-advanced expiry/offline/background-resume, physical-iPhone and live-API acceptance gates remain governed by the prior audit record. These were not repeated or silently closed.
- The install report lists five moderate npm audit vulnerabilities. This review checked the dependency delta but did not independently audit their provenance or remediation.
- Fresh remote CI must apply to the eventual published head. Local reports and prior-head CI do not replace that check.

Keep PR #4 draft and NB-3 open while these accepted manual gates remain outstanding. No new source fix is requested by this review.
