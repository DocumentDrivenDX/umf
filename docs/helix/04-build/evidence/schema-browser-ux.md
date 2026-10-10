# Schema browser UX qualification

Date: 2026-10-10. Implements [the UX plan](../schema-browser-ux-plan.md).

The existing identity and green/cream palette remain. The inspector now has
consistent sentence-case labels with preserved acronyms, original schema IDs,
a compact catalog, a desktop focus mode and a mobile catalog drawer. Structured
metadata uses full-width disclosures; scalar values remain readable cards.
Table fields have separate description and nullability columns, sticky headings
and identifiers, horizontal containment, and a field filter. Empty domain-type
columns are omitted. Ontologies use a labelled record selector and wrapped map
labels. Exports use a bounded, scrollable panel with Escape dismissal. Artifact
sources expose format, redistribution and origin badges above retained metadata.

## Actual browser evidence

Reviewed in Chromium through the in-app browser at 390 × 844, 798 × 1100,
1280 × 900 and 1600 × 1000. No document horizontal overflow at these widths.
The 83-field CMS inpatient schema filters NCH_PRMRY to one field; at 1600 px its
field/type/nullability/description columns measure 335/248/189/422 px. Mobile
sticky identifier width is 210 px; remaining columns scroll inside the table.
The catalog is hidden at embedded widths; Escape closes it and returns focus to
Browse catalog. The record selector navigates to CMS beneficiaries with its exact
stable definition key. Export panel bottom is 785 px in a 900 px viewport; Escape
closes it and returns focus to its summary. DICOM source cards expose two allowed
original downloads and distinguish fabricated from deidentified provenance.

Screenshots: [desktop fields](schema-browser-ux/desktop.jpg),
[embedded](schema-browser-ux/embedded.jpg), [mobile](schema-browser-ux/mobile.jpg),
[artifact overview](schema-browser-ux/artifacts.jpg),
[focus mode](schema-browser-ux/focus.jpg).

## Checks

- Standard TypeScript check passes, now including the explorer entry point and
  its browser imports in `tsconfig.tools.json`.
- Domain-pack suite: 87 pass, one sandbox failure binding the loopback TLS server.
  The complete affected loader-runner file rerun with loopback access passes
  all 11 tests, including that TLS case. No product test failure remains.
- Presentation regression checks preserve exact source bytes, original identifiers
  and numeric-token lexemes, including values outside JavaScript numeric precision.
- Browser/catalog build succeeds: 28 packs, 312 catalog entries.
- Native schema files, pack releases and original artifact bytes are unchanged.

## Limits

This is a visual and interaction qualification, not a comparative user study.
DataHub and DBeaver informed the plan's navigation and disclosure patterns; no
claim of feature or usability parity is established. Large graph layouts remain
scrollable rather than supporting interactive pan/zoom or automatic layout.

## Publication qualification follow-up

The first CI run reached the artifact-browser check and timed out because its
heading assertion still expected `Operator-selected originals`; the UI displays
`Operator selected originals`. The check now shares the display-label convention;
rights/download/no-network checks remain intact. Browser review confirmed that
collection opens with its original `selected-originals` ID and absence statement.
Search also now accepts displayed labels as well as exact IDs, and reveals the
catalog after focus mode. Three presentation/search tests pass (11 assertions).
