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

## Reusable software package (owner amendment, 2026-10-10)

PACK-09 extends the existing UX to a framework-neutral iframe mount and standalone
page. The iframe is deliberate isolation for CSS, hash routing and per-browser
state; hosts can mount multiple instances. The package contains browser ESM,
TypeScript declarations, local CSS, an empty catalog and usage documentation.
It contains tools, not public datasets. Supplied entries or an explicitly named
catalog URL replace microsite catalog fetching; declared relative asset URLs use
a caller-supplied base. Schema sources remain inert text. No fonts, analytics,
credentials or undeclared source acquisition are required. A host serves assets
with the correct MIME types and permits the frame/module under its CSP.

Qualification: install a built tarball in a clean consumer directory; serve its
assets; mount two instances with independent catalogs and routes; inspect tables,
artifacts and ontology; verify host state/CSS isolation, local schemas, original
text preservation and teardown. Browser package support is distinct from native
rendering of PDF/DICOM or source collection.

## npm and microsite release parity (owner amendment, 2026-10-10)

Publish patch 1.0.1 to npm with the retained dual licensing. Pin it exactly in
UMF's development dependencies and Bun lockfile. Catalog generation remains
site-specific; rendering comes only from the installed release. Site assembly
copies the package's exact renderer/browser CSS/API/assets, records a versioned
asset manifest, and refuses changed bytes or mismatched workspace markup. Site
branding CSS outside the browser workspace remains a host concern. CI installs
from the lockfile and runs consumer checks on the installed package rather than
recompiling the local source. New renderer source work needs a new immutable
package release and explicit dependency update before website rollout.

Acceptance: anonymous npm install by package name/version, package integrity,
byte-identical site/package renderer and browser CSS, unchanged bookmarks,
workspace markup parity, installed-package and artifact browser checks, page
signature checks, live browser verification and successful deployment.

## Full host embedding contract (owner amendment, 2026-10-10)

Supersedes the pending patch-only publication: release 1.1.0 addresses the full
external embedding request, with generic consumer examples and no consumer names.
The immutable 1.0.0 release remains available. Preserve the existing microsite
workspace, bookmark grammar, exact source strings and explicit validation scope.

1. Publish catalog v1 JSON Schema and host contract: bounded entries, inline or
   lazy HTTP(S) source URLs, categories, aliases, assets, annotations and revisions.
   Validate at the boundary without dynamic code generation. Record documented
   size limits, errors, CSP, browser versions and route grammar.
2. Separate producer build from catalog generation and microsite assets. Ship
   self-contained styles with design tokens, light/dark themes and system fonts.
   Split optional readers; the JSON inspection path must start under strict CSP
   without loading adapters that compile validators. Preserve qualified validation
   rather than silently reporting inspection as full validation.
3. Extend mount and the standalone iframe with versioned, origin/source checked
   messaging. Support selection, categories, annotations, local-file visibility,
   readiness, navigation and structured errors. Define readiness as initialized
   catalog/UI; destroy removes listeners and pending operations. Two instances
   must remain independent. Never accept executable schemas or message HTML.
4. Export reusable property and relationship components with keyboard access,
   exact identifiers/values, annotations and created/changed/removed styling.
   Add read-only revision comparison and history; match by stable identifiers,
   preserve originals and show changes without asserting semantic equivalence.
5. Qualify a generic strict-CSP host: inline and remote catalog, lazy sources,
   host-driven selection, relationship events, catalog 401/errors, themes,
   hidden local files, malformed messages/origins, two instances and teardown.
   Check existing tables, artifacts, ontology and downloads; no page errors or
   accidental external requests. Verify component and revision comparison views.
6. Build twice and compare output hashes, ship changelog/provenance/checksums,
   publish npm, install anonymously by name/version, pin package+lock in site,
   verify asset/workspace parity, signatures and deployed bytes. Publication
   requires actual npm authentication; no success claim before registry evidence.

Review gates: Astra Ultra reviews this plan before implementation and the final
work before publication. Resolve actionable findings and record qualifications.
Risks: runtime validators and format readers are coupled; isolate source inspection
without weakening core validation. Messaging must check origin, Window source,
instance and protocol version. Lazy fetches must preserve exact original strings
and refuse stale selection races. Diff is structural, not semantic or enforcement.

### Astra Ultra plan review disposition

Accepted all six findings: fixed validator differential parity; transitive exact
JSON/YAML split; correlated Promise selection and bounded source lifecycle;
mutually exclusive bounded catalogs with collision checks; independent scoped
components and exact structural diffs including order/unknown metadata; complete
runtime manifest parity and two clean reproducible builds. Protocol v1 bootstrap
uses explicit parent origin, source Window and instance ID, never first-message
trust or wildcard origins. Catalog ready and selected-source completion are
separate signals. JSON-only startup excludes YAML and optional native adapters.

### Embedding implementation review and release gate

Astra Ultra's final implementation review found no remaining concrete blocker after fixing transactional configure generations and acknowledgements, same-schema revision routes, srcdoc routes without a base element, fixed native grammar closure, and archived YAML initialization. The permanent harness covers missing renderer readiness, custom chrome/focus/theme/height controls, strict CSP, origin-isolated standalone messages and native fixity. Avro dynamic interpretation is intentionally qualified; its original/schema/dependencies remain exact. No browser cross-engine claim is made from Chromium evidence. Release 1.1.0 supersedes the pending npm-only 1.0.1 patch. The producer emits full payload manifests and provenance; CI verifies two clean rebuilds and exact installed-package microsite assets, including the browser base stylesheet. npm authentication is a release dependency, not an implementation approval.
