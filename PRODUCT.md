# Product

## Register

product

## Users

Northern line passengers using a phone at or near a station. They already know their origin and destination and need a quick, trustworthy answer to four questions: which train serves the destination, which platform it uses, when it reaches the origin, and when it should reach the destination. The app is also maintained by one Python/data-science developer who is learning TypeScript, React, Next.js, and web deployment.

## Product Purpose

Northern Direct removes the mental work of decoding Northern line branches. It shows only direct trains that the application can safely determine will serve the selected destination, distinguishes the next train from the best known arrival, and makes uncertainty explicit. Success means a passenger can make a confident platform decision in a few seconds without mistaking an ambiguous prediction for a valid service.

## Brand Personality

Calm, direct, and trustworthy. The product should feel like a compact consumer transport utility: fast to scan under time pressure, friendly without decorative copy, and honest about live-data limitations.

## Anti-references

- Do not imitate TfL's roundel, New Johnston typeface, maps, official status, or protected visual identity.
- Do not look like a generic administration dashboard, a marketing landing page, or a card-heavy AI-generated SaaS interface.
- Avoid gradients, glass effects, oversized pills, dramatic shadows, decorative motion, and ornamental status labels.
- Never imply certainty when routing, platform, or destination-arrival evidence is incomplete.

## Design Principles

1. Put the decision first: countdown, destination, platform, branch, and destination ETA should be scannable in that order.
2. Evidence controls language: recommend only from safe route evidence and visibly distinguish live, estimated, stale, and unavailable information.
3. Make the common journey fast: saved routes first for returning users, with a short accessible search flow for new journeys.
4. Preserve useful partial information: a missing platform or ETA must not hide a train whose route is safely known.
5. Keep the software legible: domain reasoning belongs in tested TypeScript functions, while React components focus on display and interaction.

## Accessibility & Inclusion

Target WCAG 2.2 AA. All controls need keyboard operation, visible focus, descriptive accessible names, and at least 44-by-44-pixel touch targets. Information must not rely on colour alone. Support system light and dark themes, tabular numerals for time data, high-contrast text, and reduced-motion preferences. Loading, error, offline, stale, empty, and ambiguous-data states must be announced clearly to assistive technology.
