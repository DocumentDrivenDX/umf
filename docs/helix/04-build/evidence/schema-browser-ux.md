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

## Content-density continuation

Breadcrumbs and actions now share a wrapping toolbar: measured 34 px tall at
1280 px and 63.5 px at 390 px. Site/header spacing is reduced. Actual overflow
controls horizontal-scroll guidance rather than a fixed viewport breakpoint;
guidance is hidden for the 1280 px medical table and visible at 390 px, with no
page overflow at either size. Resize observers disconnect on schema changes.
Mobile export opening/Escape dismissal and ontology CMS inpatient → beneficiary
selection pass in the real browser; graph links and stable IDs remain present.
Graph structure and layout are unchanged. TypeScript validation passes.

## Independent Astra Ultra review and fixes

Astra Ultra reviewed live 1280 × 720 views and the source diff. It reproduced
coincident stratigraphic-context paths, a hidden self-loop badge, an overview
showing only three of 22 records without explaining the subset, a 2725 px DICOM
page, field-filter loss on Back, an incorrectly visible SQL serialization control,
and inaccessible interactive SVG links. Its final source pass found no blockers;
broader graph placement remains a limitation rather than a support claim.

Implemented a searchable artifact inventory with compact disclosures and lazy
metadata rendering, visible exact references/rights/origin/download availability,
collapsed collection semantics, and no unsupported scalar artifact export.
Tables retain filters and scroll positions through field inspection and Back,
with explicit empty states/live counts. Ontology overviews show the full model;
focused views state displayed/total counts. Parallel declarations use distinct
curves, self-loops rise above records, and diagrams expose a labelled group of
keyboard-accessible links. Original data and qualified absence remain unchanged.

Parent browser verification: SEC list has 100 declarations and 50 verified local
links; search for submissions-0000320193 yields two rows, distinguishable as local
projection versus reference-only original. Expanding a row retains provenance and
checksum metadata; no-match feedback is visible. Medical NCH_PRMRY drill-in/Back
restores its query and one matching field. SQL serialization remains hidden.
Archaeology overview displays 22/22 records and 28/28 relationships; the two
stratigraphic paths differ. Samples neighborhood displays 3/22 and 3/28, with
self-loop badge at y=27 above its node at y=60. Accessible snapshot includes node
and edge links; Tab reaches the next relationship/record. At 390 px both artifacts
and diagram stay inside the page; the map scrolls internally. All checks run
through the real browser. TypeScript passes; 18 targeted tests (95 assertions)
pass, plus final loop geometry rerun. CI now qualifies counts, parallel paths,
interactive roles and Back restoration alongside existing rights/network checks.

Screenshots: [artifact inventory](schema-browser-ux/astra-artifacts.jpg),
[ontology neighborhood](schema-browser-ux/astra-ontology.jpg),
[filtered table](schema-browser-ux/astra-table.jpg).

## Reusable browser package 1.0.0 (2026-10-10)

Owner amendment PACK-09 distributes the same renderer as
`@documentdrivendx/umf-schema-browser` 1.0.0. Framework-neutral `mountSchemaBrowser`
accepts explicit entries/catalog URL and asset base, returns iframe/ready/destroy,
and isolates hash routes, CSS and instance state. A standalone empty-catalog page
accepts local sources. Source strings remain inert JSON; download schemes refuse
non-HTTP(S). The package contains software and no public source corpus.

Owner explicitly selected dual MIT/Apache-2.0 licensing. Both texts ship together;
actual bundled dependency license/notice texts are generated from Bun's input
metafile, with two pinned upstream fallbacks and retained source copyright/BSD
headers. Missing unrecognized notices fail the build.

Clean consumer installed the npm tarball offline with no dependencies or scripts.
Actual Chromium UI checks confirmed Claims field navigation and filter return,
parent state/hash unchanged, second archaeology model still 22 records/28 edges,
SEC artifact filter returning 2/100 rows, and destruction leaving one functioning
instance. Base background is rgb(244,241,233). Real-browser checks exposed and
resolved fragment links inheriting the parent base URL and font-import stripping
that swallowed CSS; regression checks cover both. No external fonts are required.
CI also qualifies tarball installation, local-only requests, standalone local
source inspection and page-error absence before website publication.

The distribution is an installable GitHub release tarball; npm registry
publication is not claimed. Consumers host static assets with HTTP(S), appropriate
module MIME types and CSP/CORS permissions. No PDF/DICOM rendering, collector,
reasoning or native semantic support is added. Full browser engine portability
beyond the qualified Chromium run remains unmeasured.

Package qualification evidence: GitHub run 38084718940 on
5ae947229d07f236a3ced65d21a467604843fda8 passed 93 domain-pack tests,
14 installed-package Chromium checks and the existing 37 artifact/browser checks
(Chromium 153.0.8010.12), with no external data/corpus requests. Its deploy gate
refused the new unsigned reuse-guide page. The guide now has a retained Innsigle
attestation; rebuilding the page and verifying all six page claims passed locally.
The initial new package step also exposed Chromium installation ordering, corrected
before the qualified run. Final deployment is independently checked after these
publication corrections; earlier partial runs are not reported as full success.

## Reusable embedding 1.1.0 qualification — 2026-10-10

Astra (`gpt-6-astra`, ultra) reviewed the plan and final candidate independently. Accepted fixes include configure race isolation and correlated supersession, source/revision routing, native fixed grammar coverage, original-byte preservation and CSP startup. Final review found no remaining concrete release blocker. Additional inspection exposed Avro's dynamic code generation: the browser now refuses that interpretation deterministically, retains an AVRO_VALIDATOR_LIMIT warning, and preserves all source/schema/dependency fields and other diagnostics. This qualification is not silently removed to force bundle hashes.

- Bun 1.3.14 typecheck passed. Focused package tests: 12 passed, 167 assertions (catalog/identity/limits, exact JSON, structural comparison, fixed-validator differential error parity, package/site drift and existing exports). The earlier full domain suite covered 98 tests; its two local environment failures passed when rerun with server binding allowed and a 30-second timeout (12 tests in the affected files).
- Chromium 153.0.8010.12 permanent embedding harness: 95 checks passed under strict script/style self, base-uri none, without unsafe-eval or executable inline scripts. Includes 18 native recovery profiles with native filename and SHA-256 checks; Avro's extra fixed-profile warning is separately asserted while its preserved fields and remaining diagnostics match exactly. Includes missing renderer ready rejection, 401 errors, concurrent selections/configuration, origin/instance checks, custom categories, dark theme, hero hiding, CSS variables, focus, annotations, revision comparison, direct components and teardown. Blob connect permission is used solely for harness read-back of downloaded bytes.
- Installed tarball consumer: public TypeScript imports compiled in a clean consumer, and 14 Chromium checks passed for tables, artifact collections, ontology, local-only asset requests and isolated frames.
- Two independent clean producer builds yielded identical complete SHA-256 release manifests, including notices and provenance. CI runs this check and the permanent embedding harness.
- Astra additionally compared 21 native fixtures byte-for-byte with normal core exports, including Delta table/log, Iceberg table, dbt semantic/artifacts, Arrow IPC, captured Parquet, Protobuf and TypeSpec; seven RDF/Smithy/Spark profiles and configuration supersession passed strict-CSP probes. These are fixture qualifications, not complete adapter coverage or native execution claims.

The generic host was also inspected in the in-app browser; host selection changed the isolated frame to the Commerce ontology in dark mode. Evidence: [embedding screenshot](schema-browser-embedding-1.1.0.png). The shipped no-build example also mounted, selected a record and focused its heading under the same strict CSP. The assembled microsite passed its 37 artifact/ontology checks across six collections with no external/corpus requests. No Firefox/Safari, PDF/DICOM content rendering, arbitrary semantic validation or enforcement qualification is claimed. npm publication and live microsite installation remain pending registry authentication and 1Password authorization for required HTML signing; the prepared source and CI gates require the exact published 1.1.0 package before deployment.

### Published embedding release 1.1.0

Published `@documentdrivendx/umf-schema-browser@1.1.0` to public npm and GitHub `schema-browser-v1.1.0`. Anonymous npm tarball SHA-256: `12b7a4831f181d78e2cf6ae608445f80bb7ce738dcd32eded7fe2b0838bc50be`. The public version metadata supplied the exact lockfile integrity; frozen installation succeeded while the package-list endpoint still had a negative cache. Site assembly from that installed release produced identical runtime assets. Clean installed consumer: 14 Chromium checks plus strict Bundler/NodeNext declarations; strict-CSP embedding: 95 checks and shipped no-build example; assembled microsite: 37 checks across six collections and four bookmark aliases, with zero external data/corpus requests. Two clean producer builds and installed release runtime/API/declaration parity passed. All six required page signatures verified. A fixed 250 ms recovery test delay was replaced with a bounded completion wait after one timing failure; all byte-fixity assertions passed on rerun. Deployment status is established by the GitHub Pages workflow, separately from these local qualifications.

### Producer replay correction and patch 1.1.1 — 2026-10-10

The untouched 1.1.0 producer revision `f35f761891e76284489806b3ca881e5ba3bf5a7f` did not reproduce the published runtime bytes at another source root, despite all 1,214 recorded producer inputs and its original lock hash matching. The earlier two matching local samples remain historical observations, and do not establish cross-context reproducibility. Retained failures and replay setup limitations are recorded in [browser patch evidence](actions-security-integration/browser-patch/README.md).

Patch 1.1.1 disables identifier minification while retaining syntax and whitespace minification, and pins the original 64-package fixed validator inventory with exact hashes. Two clean complete package manifests match; runtime assets match exactly at a second source root and in clean Linux ARM64 with Bun 1.3.14. The patch package passes 14 installed-consumer Chromium checks, declarations, strict CSP embedding and the shipped no-build example. Publication, installed exact-byte parity, website deployment and actions release remain pending at this producer checkpoint.

Patch 1.1.1 is now public on npm. Anonymous tarball download matches the committed producer package exactly: SHA-256 `ca068e551370e58bbbc9fe1ebf7bb68f7f26f6f0dc67c67ccf17613412aa120e`, 2,288,774 bytes. Its producer revision is `b2a5b4cd062b23a030ec058c345f6953f3f1e91a`. The exact dependency and registry integrity are locked; interactive npm authentication was used and MFA settings were not changed. See [public publication evidence](actions-security-integration/browser-patch/public-publication.json). GitHub release packaging and actual website delivery are tracked separately.
