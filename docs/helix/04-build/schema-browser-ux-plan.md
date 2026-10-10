---
ddx:
  id: umf.plan.schema-browser-ux
  authoring:
    home: repo
  links:
    - id: FEAT-009
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
    - id: CONTRACT-061
      kind: informed_by
---

# Schema browser workspace refinement

## Scope

Improve the existing microsite explorer's information architecture, typography,
responsive workspace, field tables, ontology and artifact inspection. Keep the
existing site palette, original metadata, stable routes and offline inspection.
The user requests design planning and iteration; local implementation and visual
verification realize that request. No schema, pack, runtime or corpus changes.
Catalog bound to installed HELIX 0.15.4 (0.15.0 was replaced during inspection).

## Shared constraints

Display labels may expand separators/acronyms; exact technical identifiers remain
visible and copyable. Never transform the native source. Number lexemes remain
exact: presentation may show token text while raw metadata retains its shape.
Original/derived meaning, rights and validation limits stay explicit. Use native
buttons, links and disclosures with visible focus and labelled controls.

## Implementation slices

| Slice | Change | Dependency | Gate |
| --- | --- | --- | --- |
| UX-1 | Consistent display labels and exact identifiers; complex metadata as full-width disclosures | None | label/token tests and native recovery |
| UX-2 | Compact header, workspace spacing, readable navigation, catalog/focus controls, responsive behavior | UX-1 | screenshots at 390, 798, 1280 and 1600 px; no page overflow |
| UX-3 | Field tables with dedicated descriptions, filter, identifiers and adequate widths; ontology/artifact styling | UX-2 | table/ontology/artifact navigation and keyboard checks |
| UX-4 | Visual critique, corrections, real-browser regressions and evidence | UX-3 | existing collection/ontology/download tests plus visual review |

## Execution contract

Implement the ordered slices within the user's refinement request. Review real
rendered output after each visual iteration. Do not claim best-in-class parity
without comparative usability evidence; use explicit acceptance criteria as the
bar for this iteration. Preserve signed HTML: changes use explorer CSS and DOM
components. No new frontend framework or data-fetching behavior.

## Validation plan

Representative views: dense medical table; appellate evidence table; company
ontology overview/record; court artifact; DICOM artifact; metadata-heavy pack;
unknown metadata and malformed source. Check desktop, embedded tablet and mobile.
Tables must retain readable identifiers/type tokens and scroll within their own
container when necessary. Human labels must retain access to exact IDs. Large
metadata must not become narrow tall cards. Catalog toggles and filters must be
keyboard usable and selection changes must preserve useful navigation state.

Benchmark references: [DBeaver table navigation and column information](https://dbeaver.com/docs/dbeaver/Data-Viewing-and-Editing/),
[DataHub search](https://docs.datahub.com/docs/how/search) and
[DataHub relationship lineage](https://docs.datahub.com/docs/features/feature-guides/lineage).
These inform navigation, progressive detail and relationship context, not an
assertion of equivalent scope or validated usability.

## Risks and rollbacks

Display formatting can blur distinct identifiers: pair labels with original IDs.
Collapsing metadata can hide material qualifications: keep descriptions/status/
rights visible. CSS affects multiple representations: inspect all listed views.
Revert workspace files to recover the existing UI; native schemas are untouched.

## Continuation evidence

Initial review: 798 px embedded browser uses a large hero, 360 px catalog, then
inspector below the fold; underscored and hyphenated labels differ across views;
structured execution/scenario metadata occupies narrow property cards.

## Exit criteria

- All four slices implemented and their gates pass.
- Iterated visual review shows readable labels, usable column widths, coherent
  hierarchy and navigation at all tested sizes.
- Original metadata, source rights and stable routes remain intact.
- Evidence includes screenshots and explicit limits; no unsupported parity claim.

## Execution result

UX-1 through UX-4 implemented and visually iterated. See
[evidence and screenshots](evidence/schema-browser-ux.md) for actual browser
widths, interaction outcomes, regression checks and comparison limits.

## Continuation — content density

Combine breadcrumbs and actions in one wrapping inspector toolbar; reduce the
site/header introduction spacing. Keep descriptions and qualification statements
visible. Show horizontal-scroll guidance only when the actual table overflows,
including narrow ontology tables; disconnect observers on schema navigation.
Recheck embedded/mobile containment, exports and ontology navigation before
publication. Graph pan/zoom remains outside this refinement.

## Astra Ultra review — tables, artifacts and diagrams

Requested independent Astra Ultra review with live browser and source evidence.
Implement compact artifact inventory/filtering with expandable retained metadata;
keep rights, provenance kind, source reference and verified download availability
visible. Suppress unsupported scalar conversion on artifact collections. Preserve
field filter/table scroll through drill-in and Back. Default ontology overview to
the full model, qualify neighborhoods with shown/total counts, separate coincident
parallel relationships and move self-loop badges outside nodes. Expose interactive
SVG content as a named group with links, and honor hidden export serialization.
Verify all of these in the real browser and retain original schemas/bytes/IDs.
