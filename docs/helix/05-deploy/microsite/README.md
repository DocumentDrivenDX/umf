# UMF microsite schema explorer

Owner direction (2026-10-08): build a browsable schema explorer for domain
packs in the existing microsite. This delivers a read-only metadata consumer
under PRD FR-39/FR-41. Domain-pack ownership and definitions remain with the
parallel pack work; this slice introduces no pack generator or backend execution.

## Build and preview

From the UMF repository root:

```sh
bun docs/helix/05-deploy/microsite/build-explorer.ts
bun docs/helix/05-deploy/microsite/serve.ts
bun docs/helix/05-deploy/microsite/verify-explorer.ts
```

The preview opens at `http://127.0.0.1:4178/explorer.html`. The last command
requires installed Playwright Chromium and the running preview. Override its
origin with `UMF_EXPLORER_URL` and Chromium with `UMF_CHROMIUM_PATH` when needed.

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

`verify-explorer.ts` exercises pack links, native foreign keys, field details,
search/empty states, exact decimals, unknown extension retention, inert source
text, source download, invalid/unresolved input, deep links, mobile layout and
navigation on existing routes. Scoped results live in
`../schema-explorer-evidence.json`. These checks do not refresh library/native
conformance, certify all possible packs, or qualify data generation.

The publishing workflow rebuilds the explorer catalog from canonical pack files.
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
