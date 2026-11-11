# NB-14: TfL colours and platform groups

Source: user request and https://synapse21.atlassian.net/browse/NB-14, child of NB-4.

Use one native line-ID palette for station search, picker headings, platform details and saved/expanded board markers. Use TfL colours corresponding to the supplied historical line-colour reference: Bakerloo #B36305, Central #E32017, Circle #FFD300, District #00782A, Hammersmith & City #F3A9BB, Jubilee #A0A5A9, Metropolitan #9B0056, Northern #000000, Piccadilly #003688, Victoria #0098D4, Waterloo & City #95CDBA. The historical East London label must not replace today's six named Overground lines. Use Elizabeth #6950A1, DLR #00A4A7, Tram #84B817, Liberty #61686B, Lioness #FAA61A, Mildmay #0077AD, Suffragette #18A95D, Weaver #9B0058, Windrush #EF7B10 and cable car #E21836. Unknown services use a neutral fallback and keep their published label.

Group platforms by their exact set of TfL service line IDs from services[].line_id. Every eligible physical platform appears once. Shared headings contain each line's own marker and name. Exclude national-rail from grouping keys while preserving all published service details on mixed platforms. Do not hardcode combinations or transitively join sets. Order Northern first, other Underground lines alphabetically, then Elizabeth and other modes deterministically; this gives Northern / Central / Elizabeth at Tottenham Court Road. Preserve source platform order within a group.

Keep direction explicit on each row after removing the outer direction sections. Preserve friendly descriptions, towards wording, blank fields, capability and navigation, physical identity/save rules, synthetic fixture mode and offline recovery. Labels use accessible theme foreground text alongside bordered colour swatches, so black/yellow never disappear and colour is not the only signal. Long shared-line headings wrap.

Approach: extend the existing native presentation layer with a pure tested grouping/palette helper and a small reusable line-label component. Hardcoded station groupings would diverge from the catalogue, and new catalogue fields would duplicate derived information. No dependencies or data-schema changes needed.

Delivery: independently reviewed PR into feat/NB-13-shared-platform-departures, with latest-head CI passing. Leave PR open. This is a narrow refinement; user has explicitly requested immediate execution through ticket-agentic-development.
