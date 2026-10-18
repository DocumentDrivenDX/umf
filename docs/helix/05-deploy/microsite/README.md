# UMF microsite schema reference

## Browser SQL-to-actions compiler

`bun docs/helix/05-deploy/microsite/build-action-compiler.ts` builds the reviewed local-profile
Weft WASM compiler and its exact pinned UMF preparation cohort into static assets.
It needs no compiler service or mutable Weft checkout. The retained compressed
WASM and wrapper are verified against their original SHA256 before publication.
The page is `action-compiler.html`; verify it with
`bun docs/helix/05-deploy/microsite/verify-action-compiler.ts`, which starts an
ephemeral static server and checks actual Chromium with external/write requests
blocked. Example rows are explicitly unchanged by this compiler-only stage.

The browser-local Truss path uses the separate [CONTRACT-905 source cohort](https://github.com/DocumentDrivenDX/umf/blob/40f011402bf8f0c9512225975b62a034f1da325c/docs/helix/02-design/contracts/CONTRACT-905-browser-local-actions.md),
an issued local-store owner and independent selection-read grant. The reviewed
required-String, rootless Products proof covers public loading, preparation,
frozen materialization/sealing, keyed queueing/claiming, atomic batches, recovery,
committed row history and cancellation. Exact component evidence is retained
below; broader native person/session and full bulk protocols remain independent.
GitHub Pages remains the publishing target.

This website candidate embeds the reviewed UMF ESM from `c1e316c4` (producer
`6b331c0b`, bundle `86fd188e`) inside the canonical Truss bundle. Publishing these assets against current
main leaves its library `src/`, `spec/`, package and lock files unchanged; it does
not qualify that different library build as the original producer. Replacing the
frozen artifact requires a separately constructed and qualified source cohort,
as tracked in the [shared implementation ledger](https://github.com/DocumentDrivenDX/umf/blob/e05e67365e03a374af0e56008263acce47307edd/docs/helix/04-build/typed-persistence-design.md#coordinated-sql-to-actions-implementation-ledger).

The schema package remains reusable. The public site has one schema host at
`reference/core.html`; its Ontology, Object reference and Model catalog views
share one route. The catalog is mounted from the exact released package under
`/schema-browser/assets/`; the site build does not patch its renderer or ship a
second explorer page.

## Build and preview

From the UMF repository root:

```sh
bun docs/helix/05-deploy/microsite/build-explorer.ts
bun docs/helix/05-deploy/schema-browser/publish-site.ts
bun run build:reference
bun docs/helix/05-deploy/microsite/serve.ts
bun docs/helix/05-deploy/microsite/verify-schema-views.ts
```

The preview opens at `http://127.0.0.1:4178/reference/core.html#view=ontology`.
The last command requires installed Playwright Chromium and the running preview.
Override its origin with `UMF_REFERENCE_URL` and Chromium with `UMF_CHROMIUM_PATH`
when needed.

Catalog generation scans `domain-packs/`, `packs/`, `spec/domain-packs/`,
`examples/domain-packs/` and retained `catalog-sources/`. Explicit source
roots may be supplied as positional arguments, replacing default roots.
The build copies selected original sources into `dist/schema-catalog.json`;
browsing performs no source-directory access or external reference fetching.

Each JSON manifest with pack identity and domain types (with an optional generator) contributes
its metadata and every declared
local schema reference. Canonical source roots take precedence over the same
pack/version in retained snapshots. References escaping the pack directory refuse the
build. Missing or unsupported referenced schemas fail explicitly. UMF documents
are also discovered directly. The legal snapshot contains one pack and eight
TableSpec schemas; `provenance.json` records source identity and fingerprints.
The canonical medical pack contributes eight TableSpec schemas and three domain
types. Its fixed official fixtures use source bindings and fixture counts without
a generator. These declarations remain visible in the pack overview; the browser
inspects schemas and does not load patient rows.
The four medical-family subpacks add eighteen TableSpec schemas. Their independent
pack/version namespaces keep same-named resources and fields distinct. The catalog
includes source/rights metadata and qualification; it does not retrieve dataset
rows, licensed dictionaries or DICOM pixel objects.

The canonical NYC TLC, MovieLens 32M, NOAA GHCN Daily and GTFS Schedule packs
add 16 schemas. The current catalog contains 20 packs and 240 entries, including
the existing core example. External source profiles, documentation fingerprints
and unresolved dataset choices remain visible as metadata. Browsing does not
fetch the datasets or certify their schema profiles as instance validators.

## Inspection contract

- Each pack/version owns its Overview, Schemas and Domain types in the catalog.
  Examples and local files remain separate. Breadcrumbs identify the selected
  pack/schema/type, and column domain-type links resolve only inside that pack/version.
- Search pack/schema names, IDs, descriptions and retained source content.
- Deep links identify catalog entries and definitions; browser history works.
- UMF inspection uses the existing document reader and validator. Core references,
  members, keys, facets, relationships, defaults and unknown extensions remain
  available without asserting native execution or enforcement.
- Legacy TableSpec tables use CONTRACT-030 import/inspection. Their native
  types, column metadata, keys and declared foreign keys remain native declarations.
- Pack metadata validates the canonical manifest and declared execution profile.
  JSON Schema keyword views remain source inspection only. Dataset generators
  and graph consumers do not execute here. Numeric native values display as exact `numberToken`
  carriers rather than rounded JavaScript numbers.
- Local JSON/YAML schema files stay in the browser. Download returns the original
  source. Unsupported or invalid input refuses with a visible message.
- Schema text is rendered as text, never executable HTML. Generator IDs and
  schema references never trigger code execution or network fetching.

## Acceptance and evidence

`verify-schema-views.ts` exercises the single-host ontology, object-reference,
and embedded-catalog routes in Chromium under strict CSP. The package browser
tests continue to cover pack links, field details, source preservation, search,
downloads and deep links. These checks do not refresh library/native
conformance, certify all possible packs, or qualify data generation.

The publishing workflow rebuilds the catalog from canonical pack files and
installs the exact reusable package without rewriting its page or scripts.
Page signatures must be renewed after published HTML changes; CI verifies them
and copies the public attestations into the site artifact.

## Ontology inspection — 2026-10-08

Pack navigation separates Tables and Ontology. UMF ontology records have
property/type/availability/identity tables and incoming/outgoing relationship
links. Record and table views link in both directions only under CONTRACT-053's
explicit graph/table profile and exact schema/Record IDs in one pack/version.
A record neighborhood is the default map; a focus selector and Show full model
control expand it. Nodes open records, numbered edge targets open relationship
declarations, and matching edge labels show source/target participation.
Multi-endpoint relationships and endpoints outside the record model remain
listed explicitly rather than being drawn as misleading binary arrows.
Unknown/other definitions and source metadata remain inspectable. No inheritance,
equivalence, OWL inference or instance-data meaning is invented.

Catalog construction suppresses the 16 duplicate pack-owned ontology entries
and retains their previous repository-path IDs as aliases on canonical entries.
Legacy redirects preserve other URL parameters and restore pack breadcrumbs.
The desktop catalog scrolls within the viewport; mobile maps scroll inside
their own panel. Schema bytes remain unchanged.

Scoped verification: 29 pack tests / 1,199 assertions pass across six files,
TypeScript checks pass, and Chromium 153.0.8010.12 passes 19 explorer checks
against the local preview. Initial checks caught a relationship-array tooling
type error and zero-height SVG edge hit areas. The corrected renderer guards
array shape and adds numbered, keyboard-focusable edge targets; reruns pass.
The canonical catalog now contains 20 packs / 240 entries. This qualifies
source inspection and browser interaction, not ontology reasoning or backend
execution. These results record local verification before publication.

### Merge qualification

Integration onto master `a917e1b4` preserves the newer legal 1.1.0 corpus and
four medical subpacks. Rebuilt catalog: 24 packs / 266 entries. All 37 pack
tests / 1,530 assertions, both TypeScript configurations and all 20 Chromium
explorer checks pass. The legal navigation assertions now use 1.1.0; initial
integration verification exposed their stale 1.0.0 assumption. Earlier
20-pack totals describe the preceding checkpoint.

### Schema downloads

The explorer's **Download as…** panel implements `umf-browser-scalar-export-1`
for TableSpec 1.0 tables and core records with resolved scalar, single-valued
members and explicit nullability. Nine targets are available: PostgreSQL DDL,
SQL Server DDL, Spark/Delta DDL, JSON Schema 2020-12, Avro, GraphQL SDL,
Protobuf proto3, OpenAPI 3.1 components and Spark StructType JSON.

This is a schema scaffold, not a certified execution binding. Integers use
signed 64-bit carriers (decimal strings in JSON Schema/OpenAPI); float uses
double; decimal/timestamp use text. Keys, relationships, defaults, constraints,
formats and extensions remain in the exact source companion. Requiredness is
not enforced by GraphQL type declarations or Protobuf presence. Avro returns
a union of records; Spark returns a table-name map. Unsupported fields block
the entire generated export. Preview and explicit review precede downloading.
The JSON export bundle contains output, diagnostics, profile and exact source.

Native recovery is separately available for recognized retained adapter payloads;
adapter validation guards emission. Recovery does not create a new target from
arbitrary UMF. Retain the source companion for dependencies and other vocabularies.
Binary descriptor downloads do not imply Protobuf source generation.

Domain packs start collapsed. Selecting a schema opens its owning pack; search
opens matching packs. Explicit expansion state is retained during navigation.

## Human-facing serialization — 2026-10-08

Playground presets and output default to YAML; JSON input and output remain
available. Explorer metadata and schema views use YAML while original source
text and downloads retain their exact bytes. JSON Schema and OpenAPI generated
files default to YAML with an explicit JSON option. Avro and Spark previews use
YAML for reading; their native downloads and the interchange report bundle stay
JSON. SQL, GraphQL and Protobuf keep their native syntax.


## Integrated medical sample family 1.1.0

The Medical overview and each medical-family schema link Clinical, Carrier,
Epidemiology, Imaging and Terminology. All five fixed profiles have ontology/table
companions; the family contains 29 tables/five ontologies. The catalog remains
24 packs and now has 273 entries. Legacy 1.0.0 medical bookmarks redirect to the
current 1.1.0 subset. Source namespaces are never merged or matched implicitly.

Local source-inclusive export constructs `dist/pack-assets/` during every build.
Only checksum-verified local samples with allowed rights are published; source
metadata never causes a remote fetch. Overviews download original CSV/FHIR/DICOM
files and notices; selected table pages link their bound CSV. The public CMS
synthetic excerpts retain ICD-9 meanings; TCIA LIDC-IDRI contributes one
CC BY 3.0 native CT slice with separate metadata and explicit projection losses.
`Sample scope` exposes limits while composition/execution metadata stays available
in a collapsed source detail. Deployment regenerates assets rather than committing
duplicate originals. 24 Chromium explorer checks pass, including actual public
sample downloads/hash equality, all catalog entries, family navigation, ontology
links, old bookmarks and mobile containment. Detailed reproduction and native
checks are in `../../04-build/evidence/medical-subpacks.md`.

## Schema browser workspace refinement — 2026-10-10

Readable labels preserve technical IDs and native source downloads. The catalog
uses a responsive drawer and desktop focus mode; fields have filtering, sticky
identifiers and roomy description columns. Ontologies use record selection and
wrapped graph labels; structured metadata uses full-width disclosures. Export
panels remain inside the viewport. Browser entry-point typechecking is part of
`bun run typecheck`. Visual evidence and limitations:
[workspace qualification](../../04-build/evidence/schema-browser-ux.md).

The SQL page also opens a worker-owned Truss browser catalog using the reviewed
canonical provider described by `assets/truss-browser/provenance.json`, built from
Truss commit `64b8f813ca82f240e8030bf2970955939f80b725`. The manifest
captures every actual source hash. This website candidate is not published. Build it with
`bun docs/helix/05-deploy/microsite/build-truss-browser.ts` before the compiler
build. The retained archive binds the original manifest and every original asset;
the build needs no sibling checkout or network download. The worker keeps its
owner capability private and accepts open/register/preview/seal/recover/submit/recover-submit/claim/recover-claim/execute/recover-execute/rows/cancel/recover-cancel/history/review/close commands against the
fixed local Products model. Prepare UPDATE registers the actual generic Truss
catalog, then asks Truss to admit the original local action and separately issue
its selection-read grant. The original owner, action and grant capabilities stay
inside the worker and are issued afresh after reopen. Preview invokes the original compiler/lowerer against real Truss rows and
constructs the original UMF frozen manifest; seal and recovery use Truss custody.
Prepare UPDATE loads the four original samples through public `loadObjects`, reads the actual generic Truss rows through `readObjects`, and commits the exact original load input/control to a strict IndexedDB admission transaction before its first dispatch. Every later prepare/reopen calls `recoverLoad`; missing recovery stops preparation and never redispatches a load. It replays the creation receipt without resetting current values. All unsuccessful load outcomes remain visible and detach the worker. Actual frozen batches execute through the owned Truss API. The local public committed-row reader and cancellation/recovery are available. Controls, manifests, admissions and outcomes remain retained for the store incarnation with no automatic purge. Feed ACKs, shorter retention and broader full local-bulk/native904 qualification remain outside this proof.
The browser verifier checks registration, unchanged retry, second-tab exclusion
and catalog/incarnation retention after reload under a `/umf/` base path.

The local compiler is pinned to Weft compatibility source `ab94595f`, WASM
`4434aad3`, original local model `b8ce3cfe` and preparation `7ee1afaa`.
The new layout 0.2 store and its dispatch journals use the
`umf-products-demo-layout02` prefix; existing layout 0.1 data stays untouched.
Fresh Chromium checks cover the assembled page and a separate 1,024-row
workload across 11 batches, replay and reopened readback. Observed bulk execution
takes 5.299 seconds and the point UPDATE takes 295.08 milliseconds in the
separate exploratory provider run. Private seal input 0.2 retains the model source
once instead of repeating it in every key receipt, while preserving old seal recovery.
Admission object/key reads are batched; immediate per-item effect verification
retains the original failure order and rollback behavior.
These observations do not establish a statistical speedup or meet a performance target: performance
remains failed. The page has not been qualified on the public GitHub Pages origin.
The retained [publication projection](../../04-build/evidence/bulk-update/website-publication-projection.json)
is historical evidence for the earlier UMF `633f8ad6` cohort. It does not
qualify the current candidate; the current assembled-page results are in
[website compiler results](../../04-build/evidence/bulk-update/website-compiler-results.json). Historical native compiler assets remain retained
separately and are not relabelled. The compiler and catalog now use the same
local model; the examples and actual Truss rows are displayed separately.

Before seal dispatch, the page saves the original request key, attempt, source
intent and inert seal reference in an atomic, strict-durability IndexedDB transaction.
Transaction completion precedes dispatch; a failed reservation sends no seal RPC.
Fresh journal reads and cross-tab notifications prevent stale-tab intent replacement.
A pending intent blocks a fresh seal; reload requires reopening and freshly
preparing capabilities before recovering the original reference. All returned
control outcomes and receipt/manifest bytes are retained, including unresolved
absence and uncertain storage outcomes. These metadata are not authority.
The Chromium test deliberately drops an actual sealed acknowledgement, closes the owner tab
and recovers the same bytes from an already-open second tab. It also refuses an injected pre-dispatch storage
quota failure. The website test publicly loads four rows, verifies exact load receipt/data after a dropped actual preparation acknowledgement and reload, then selects three rows into batches [2,1]. No administrative seeding is used.


The browser can queue the sealed manifest, claim its first batch and review the
job using original Truss APIs. Before either first dispatch, a strict atomic
IndexedDB reservation retains the complete input, distinct submission key and
control request/attempt, bound to the original seal reference. A pending record
blocks fresh dispatch even from a stale tab; recovery reuses the exact input with
fresh private engine capabilities. All returned result variants are retained.
Unknown and unresolved outcomes detach the worker without a new request or
attempt. The first-claim control is retained even after recovery: neither lease
expiry nor observing a recovered claim grants execution eligibility. Execution uses a separate strict `execute:n` intent for each batch; once it exists only `recoverBatch` is called. Fresh authoritative job progress chooses the next batch. A recovered claim correlates the first execution input; actual current authorization, active fence, PostgreSQL lease and engine admission decide whether it may execute. Indeterminate execution detaches without redispatch. The browser verifier drops the actual
initial submission and claim acknowledgements, reopens and recovers the original
job, fence and lease, and verifies the original manifest. Execution tests drop the actual first committed batch response, recover the exact full item results and receipt after reopen, finish batches [2,1], and verify actual row values/versions, unchanged fourth object and duplicate replay.


`readFeed` exposes original committed journal events and origin artifacts with
bounded row pages (five rows in the UI); pages may split a committed batch. The
page retains the exact scoped cursor in memory without acknowledging events or
advancing a projection checkpoint. Reload may read history again. Tests verify
four create/three property events, original UTF-8 artifact digests, a batch split
across pages and an unchanged empty tail after reopening the same store.

Cancellation reserves the complete original input/control in a strict host
transaction before dispatch. Later attempts only call `recoverCancel`. A queued
job cancelled before effect admission produces no business effects; an admitted
uncertain batch is never declared rolled back by cancellation. The original
cancelled response survives lost acknowledgement/reopen unchanged. Work and
outcomes remain retained for the lifetime of the store incarnation. Browser
storage eviction/clearing is outside this recovery claim; no purge API is used.
