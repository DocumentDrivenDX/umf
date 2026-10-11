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

## Consumer follow-up review — 2026-10-10

### Scope and disposition

Review source: the owner's pasted reusable-browser follow-up, based on consumer
measurements of 1.0.0. Retain that intake unedited. It is useful historical
evidence, but its open-item list predates the current 1.1.0 implementation.
Catalog: installed HELIX 0.15.4 `workflows/graph.yml`; review mode. Governing
scope remains FEAT-009 PACK-08/09/10, CONTRACT-052, CONTRACT-061 and the full host
embedding amendment above. This continuation authorizes planning only.

| Requested improvement | Current evidence | Disposition |
| --- | --- | --- |
| Exact CSP, remove unsafe-eval and base element | README/HOST_CONTRACT; fixed validators; missing-renderer/CSP harness | Implemented; reconcile the two documented policy examples and qualify them as tested policies rather than a universal minimum |
| Catalog schema, category and schemaFormat contract | catalog.schema.json, catalog.ts, HOST_CONTRACT | Implemented; replay catalog boundaries |
| Events, origin-checked standalone messages, select after mount | index.ts, types.ts, HOST_CONTRACT | Implemented; use the shipped object-based Promise API, not an additional positional overload |
| Reliable ready and structured errors | Initialized-catalog handshake, catalog errors and 30-second missing-module timeout | Implemented; document timeout-based failure detection, without promising immediate diagnosis of every blocked script |
| Standalone catalog URL or entries | catalogUrl query and checked configure protocol | Implemented; retain explicit origin/Window/instance/protocol checks |
| Height, hide hero/local files, custom categories/status | Mount options and generic example host | Implemented; verify real flex containment and keyboard return |
| Theme and dark mode | theme/themeVariables, dark tokens and auto handling | Implemented; accessibility across actual surfaces needs fresh measurement |
| Muted text contrast | Default muted changed from #65736b to #526057 | Reported token corrected; no complete accessibility pass follows from that edit |
| Code splitting/startup cost | build.ts enables splitting; YAML/native readers load lazily | Implemented mechanism; fresh size and startup measurements remain unqualified |
| Keyboard focus | focus() and documented heading/DOM focus order | Implemented; perform keyboard inspection beyond the existing focus assertion |
| Host annotations | Text-only badges/tones/tooltips and setAnnotations | Implemented; presentation must not imply verified permissions or authorization |
| Reusable table/map components | renderPropertyTable/renderRecordMap with destroy handles | Implemented; these use an explicit component model, not automatic rendering of every native schema |
| Revision history and created/changed/removed diff | compareDocuments/renderDocumentDiff and entry revisions | Implemented structural comparison; broader graph semantics remain qualified |
| Release checksums/changelog | Build manifest/provenance and recorded 1.1.0 publication evidence | Already covered; retain immutable release and site parity gates |

Recorded execution evidence is in [schema-browser-ux.md](evidence/schema-browser-ux.md),
including the 1.1.0 publication section and its scoped Chromium checks. This review
inspected source and existing evidence; it did not independently verify public
registry metadata or deployed assets.

### Remaining implementation slices

| Slice | Area | Depends on | Validation gate |
| --- | --- | --- | --- |
| FOLLOW-1 | Restore dependencies from the frozen lockfile and replay the installed 1.1.0 host baseline | None | Embedding unit tests and `bun scripts/schema-browser-embedding-browser.ts`; preserve failure/run/browser versions |
| FOLLOW-2 | Accessibility audit and bounded corrections | FOLLOW-1 | Measure rendered contrast in light/dark/auto, annotations and diff states; keyboard traversal through catalog/map/property views, focus(), host return and teardown; readable status independent of color |
| FOLLOW-3 | CSP/API documentation reconciliation | FOLLOW-1 | One tested baseline plus explained optional image/download/cross-origin permissions; verify srcdoc and standalone separately; no unsafe-eval/base violations; matching public types/examples |
| FOLLOW-4 | Startup and bundle measurement | FOLLOW-1 | Record initial and lazy transferred bytes, request closure and mount-to-ready/source-render times for JSON, YAML and native recovery; repeated runs with environment/cache conditions and exact-source checks |
| FOLLOW-5 | Only if changes are needed, release a new immutable version and update the site pin | FOLLOW-2/3/4 | Existing reproducibility, installed consumer, strict-CSP, asset parity, checksum/changelog and signing gates; qualify actual registry/deployment separately |

### Execution contract and validation plan

Do not reimplement the delivered API or add a framework, general reasoner,
authorization engine or source collector. Accessibility colors and dark surfaces
are the highest-value unresolved checks. Performance optimization follows measured
remaining cost; the consumer's 0.85-second observation is not a portable target.
Do not weaken validation to improve timings. The existing release contract owns
publication; this review does not execute publication or deployment.

Runtime token estimate and spending ceiling are unknown: no usage baseline or
owner budget is supplied. Keep work bounded to the slices above; propose any
larger optimization separately. No tracker or additional reviewers are required
by this continuation. Before handwritten implementation, reconcile the existing
project boundary checks and governing test plan; record their actual commands
rather than inventing a new boundary policy in this review.

### Continuation evidence

Current review attempts: `bun test tests/domain-packs/schema-browser-embedding.test.ts`
stopped on missing `ajv/dist/2020`; the browser script stopped on missing
`playwright`. Bun was 1.4.2. Neither reached behavioral assertions. Prior
qualification used its recorded toolchain and is not a fresh pass here.
No implementation, intake rewrite or package change was made in this review.
Next action is FOLLOW-1, then accessibility and documentation checks.

### Authorized execution continuation — 2026-10-10

The owner subsequently authorized Astra Ultra review, dependency installation,
checks, accessibility/CSP corrections and startup measurement. FOLLOW-1 through
FOLLOW-4 are complete for the local 1.1.1 candidate. The earlier planning-only
and missing-dependency statements above describe the initial review, not this
execution. FOLLOW-5 remains a separate publication and matching site rollout;
the installed dependency, lockfile and deployed-site assets remain at 1.1.0.

Astra Ultra reviewed the implementation and final corrections and found no
remaining concrete blocker in this scope. Its findings led to selected-source
loading without eager pack companions, readable SVG relationship numbers and
change states, annotation-aware record heights, distinct parallel relationship
badges and clearance above the next row. Source panes now participate in keyboard
navigation. Unloaded pack metadata has explicit navigation rather than silently
fetching companion documents. The final replay covers a six-record fixture with
three parallel relationships and table → pack → table → ontology → table navigation.

The README and HOST_CONTRACT now agree on a tested same-origin CSP baseline for
srcdoc and standalone embedding. It uses no unsafe-eval and permits no base URI;
optional image/cross-origin permissions are explained separately. Browser download
events confirm exact source-companion bytes without a blob-fetch permission.
The accessibility measurement page alone allows axe's inline style probes;
product policy and performance tests retain the strict documented policy.

Fresh execution evidence, commands, measurements and qualifications are retained
in [schema-browser-followup-2026-10-10.md](evidence/schema-browser-followup-2026-10-10.md).
The candidate is 1.1.1 (unreleased), with unchanged public options/catalog shape.
No registry publication, signing or deployed-site update is claimed.

### Risks, rollbacks and exit criteria

Keep original source strings, exact numeric tokens, unknown metadata, stable IDs
and rights qualifications. Custom host colors cannot carry a blanket contrast
guarantee. Annotations remain host assertions. Structural diff cannot establish
semantic compatibility; the map projection currently includes only relationships
with one source and one target. Preserve other relationships in the textual diff;
do not label the graph a complete semantic comparison.

Documentation changes can be reverted independently. Renderer changes require a
new release; rollback selects the prior immutable package and matching site assets.
Completion requires fresh baseline results, recorded accessibility/performance
scope, resolved documentation drift and any required release gates. If measurement
shows no behavior defect, record that result without manufacturing a code change.

### Owner discussion

Accept the requested capabilities within the scoped contract. Do not adopt the
1.0.0 unsafe-eval allowance or unset-base-uri workaround as the current host
requirement. Keep the implemented selection signature. Treat permission badges
as display-only and revision diff as structural. Further startup optimization
depends on new measurements; complete semantic graph diff needs separate scope.
