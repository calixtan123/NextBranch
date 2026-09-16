# Northern Direct design system

This records the visual system already implemented in `src/app/styles.css`,
`src/app/layout.tsx`, and the components. It is a preservation guide, not a
redesign.

## Tokens

The light palette uses warm paper `#F7F4EE`, white surfaces, near-black ink,
muted grey copy, warm grey borders, and restrained red accent `#B63A32`. Dark
mode swaps background/surface/ink/muted/line/accent values in the media query.
Use the existing custom properties instead of introducing one-off colours.

## Type and layout

Atkinson Hyperlegible is bundled locally in regular and bold weights and is
loaded through `next/font/local`. The content column is capped at 680px with
16px mobile gutters. Headings are compact; train countdowns and times use
tabular numerals for quick scanning. Cards use 10px corners, light borders,
and no gradients, glass, or large decorative shadows.

## Controls and states

Buttons and inputs have at least 44px height, visible red focus rings, and a
simple bordered surface. `.primary` is reserved for the main action; text
buttons remain quiet and underlined. Results lead with countdown, destination,
platform, and destination ETA. Loading, empty, offline, upstream, invalid,
stale, inferred-route, unavailable-ETA, and ambiguous-service states are
written explicitly; colour never carries the whole meaning.

## Accessibility

Keep semantic headings, labelled comboboxes, live/status and alert regions,
descriptive remove buttons, keyboard navigation, and visible focus. Preserve
the light/dark contrast intent, reduced-motion media query, and responsive
single-column detail layout. Avoid adding animation that could make a time
critical state harder to perceive.
