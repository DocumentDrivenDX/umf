---
ddx:
  id: CONTRACT-052
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-051
      kind: informed_by
---

# CONTRACT-052: Portable domain packs

**Type:** schema/library. **Version:** `umf.domain-pack` and `umf.dataset-source` 1.0.0. **Status:** draft.

## Purpose

Describe portable sample-domain metadata while separating UMF-owned schemas
from consumer-owned executable generators, loaders and data tests (FR-45).

## Scope and Boundaries

UMF owns canonical pack structure and tooling to generate that structure.
TableSpec owns fabricated tabular data, CSV archives and ingestion/testing.
Truss and Ashlar own ontological sample data. Pack metadata MUST NOT authorize
imports, expression execution, credential handling or network fetching.

## Normative Surface

The generated structural authority is
[domain-pack/schema.json](../../../../spec/extensions/domain-pack/schema.json),
JSON Schema Draft 2020-12. The document-scoped extension package carries the
same schema. A standalone payload MAY be consumed without a core envelope.

| Field/API | Required | Rules |
| --- | --- | --- |
| `id`, `version` | Yes | Nonempty pack identity; exact numeric three-part version. |
| `generator.id`, `.version` | For synthetic generation | Opaque implementation identity and exact version; only a trusted consumer registry can resolve them. |
| `domain_types` | Yes | Nonempty map with identifier-shaped keys and object definitions. |
| `description` | No | Descriptive text. |
| `sources` | In place of or alongside generator | Nonempty source map using `umf.dataset-source` descriptors; no retrieval implied. |
| `source_bindings` | No | Explicit `schema_id`, `source_id` and `role: rows/reference/terminology`; consumer MUST resolve local identities before execution. |
| `scale_presets` | No | Named `roots` counts and `children` parent/mean/distribution declarations; graph execution and overrides belong to TableSpec. |
| domain type `sample_generation.method` | If generation metadata present | `generate_`-prefixed identifier; consumer MUST explicitly support it before execution. |
| domain type `detection` | No | Retained object; its interpretation is consumer-specific. |
| `schemas` | No | Ordered objects with nonempty `id`, `format`, `reference`; references MUST NOT be fetched implicitly. |
| Unknown fields | Allowed | MUST remain in metadata copies and serialization; structural admission does not establish their execution semantics. |
| `generateDomainPackSchema()` | Library | Browser-compatible, deterministic, isolated schema result. |
| `domainPackSchema`, `domainPackPackage` | Library | Canonical structure and registration data. |
| `domain_pack_schema(version)` | Python | Isolated canonical schema resource; unknown versions refuse. |

### Dataset source extension

`umf.dataset-source` 1.0.0 is independently registerable at document scope.
Its structural authority is
[dataset-source/schema.json](../../../../spec/extensions/dataset-source/schema.json).
Domain packs embed the same generated definition without fetching schema resources.

| Field | Required | Rules |
| --- | --- | --- |
| `kind` | Yes | `synthetic` or `external`: provenance origin, not a claim about whether rows describe real people. |
| `data_kind` | Yes | `fabricated`, `observed`, `deidentified`, `unknown`; an authored declaration, not proof of privacy or realism. |
| `generator.id`, `.version` | Synthetic source | Exact trusted implementation reference; source parameters remain consumer-specific metadata. |
| `reference`, `format` | External source | Nonempty opaque resource reference and format identifier. No source is fetched or interpreted merely by declaration. |
| `revision`, `checksum` | No | Revision identity; checksum uses SHA-256 with a lowercase hexadecimal value. Consumers SHOULD pin source bytes before claiming reproducibility. |
| `license` | No | License identity/reference, attribution/notices and `redistribution: allowed/restricted/unknown`; missing rights MUST NOT imply clearance. |
| `provenance` | No | Publisher, retrieval timestamp text, upstream source IDs and transformation descriptions; opaque descriptions MUST NOT execute. |
| Unknown fields | Allowed | Preserve; qualify their interpretation separately. |

An externally published synthetic fixture is `kind: external` and
`data_kind: fabricated`. A mixed pack declares multiple sources and explicit
bindings, preserving source identities rather than merging records heuristically.
No credentials, authorization headers or credential-bearing references belong in
pack metadata. Retrieval, local source binding, integrity verification, format
conversion and redistribution decisions are explicit consumer operations. Known
structural validation does not certify scientific comparability or reuse rights.
The initial TableSpec reader retains external/mixed declarations but refuses
synthetic generation for external row bindings; its explicit local CSV ingestion path
performs typed ingestion into the shared disk-backed spool without a fabricated
fallback. Before redistribution, that consumer requires pinned SHA-256 bytes
and explicit `redistribution: allowed` for every included local source. This is
an authored rights gate, not an independent legal certification. Arbitrary
retrieval and mixed-data transformation remain outside this execution subset.

## Precedence and Compatibility

Extension version 1.0.0 uses the existing bootstrap extension-package envelope
(`coreVersion: 0.1.0`); tests attach it to current core 0.8.0 documents. The
payload is additive and does not change core semantics. Pack version, extension
version and generator implementation version are distinct. Unknown implementations
or relevant execution properties MUST fail before generation, not select fallback
code. Schema references do not prove native schema validity or interoperability.

## Error Semantics

Malformed known structure is invalid. Duplicate extension registration follows
CONTRACT-001. Unknown implementation/version/method refuses consumer execution;
metadata remains available for preservation. No retry or live service is implied.

## Examples

```json
{"id":"legal","version":"1.0.0","generator":{"id":"tablespec.legal","version":"1.0.0"},"domain_types":{"client_name":{"description":"Fabricated organization","sample_generation":{"method":"generate_client_name"}}},"schemas":[{"id":"clients","format":"tablespec","reference":"clients.json"}]}
```

## Non-Normative Notes

`bun scripts/domain-pack-schema.ts` regenerates canonical artifacts;
`--check` refuses stale output. Consumers may ship a generated snapshot to avoid
requiring an unpublished UMF revision. They MUST identify UMF as its authority
and refresh from the generator, rather than independently editing the schema.
Native schema compilation and value realism are separate consumer evidence.

### Legal pack source and export tooling

UMF owns `spec/domain-packs/legal/pack.json` and its eight tabular schemas,
including source declarations and scale presets. `scripts/export-domain-pack.ts`
exports those caller-selected local schema artifacts and metadata; `--check`
refuses stale exports. Schema references and symlinks leaving the pack directory
refuse. Dataset references remain opaque. The first native profile is TableSpec
1.0 JSON, using the existing import/export adapter to check exact recovery.
Other format labels are preserved without claiming their compilation support.
TableSpec's bundled snapshots and examples are generated consumers of this source.


### Medical source pack and explicit local-source export

`spec/domain-packs/medical/pack.json` uses the same 1.0.0 metadata contract and
TableSpec schema profile as legal. It declares externally published example
rows without a generator. Exact source files, projected CSV rows, source hashes,
rights notices and unresolved native references remain distinct. FHIR date/time
and decimal spellings that cannot be represented without changing meaning remain
text; full original resource bytes are retained.

`export-domain-pack.ts --include-sources` explicitly copies local external
sources only when checksum-pinned and declared redistributable. Remote references
remain metadata. Source path traversal, escaping symlinks, duplicate destination
paths, stale checksums and uncleared rights refuse. The default schema-only export
remains unchanged. No new domain-pack schema version is needed for this execution
subset. TableSpec archive manifests map original source references to `inputs/`
archive members and schema references to `schemas/` members, separate from
standardized `data/` output; source metadata is
preserved without rewriting its checksums to describe derivative bytes.

### Public dataset schema profiles

The first public packs use the same 1.0.0 metadata contract and authored
TableSpec 1.0 JSON schema format:

| Pack | Declared profile | Schemas |
| --- | --- | --- |
| `nyc-tlc` | Yellow dictionary 2025-03-18; January 2025 row reference | Yellow trips and taxi-zone lookup |
| `movielens` | Fixed `ml-32m` release generated 2023-10-13 | Movies, links, ratings, tags |
| `noaa-ghcn-daily` | GHCN-Daily documentation 3.35 | Stations, monthly `.dly` records, inventory |
| `gtfs-schedule` | Basic fixed-stop Schedule fields at commit `3c9e7b904b5035349622f03e11851e25c16d1d99` | Agency, stops, routes, trips, stop times, calendar, calendar dates |

Each pack retains `profile` as descriptive consumer metadata. Documentation
sources have SHA-256 fingerprints and `role: reference`; row sources and their
bindings remain separate. Documentation checksums MUST NOT be interpreted as
row-data pins. No source bytes are bundled. GTFS's unresolved feed URN MUST NOT
be treated as a selected agency dataset or executable loader reference.

Pack schemas describe authored carriers, not automatically derived Parquet
physical types or complete source-instance validators. Taxi trip identities
are not invented; nullability is explicitly permissive. MovieLens identifiers
retain text where leading zeros matter, and no user entity is fabricated.
GHCN retains all 31 monthly slots, source integers, missing sentinels and flags.
GTFS retains service-day times and dates as text; conditional and union
references remain explicit profile descriptions instead of false foreign keys.
Unlisted source fields/files MUST remain in retained input or produce explicit
loss reporting. No source parser, cross-system equivalence or row rights
clearance follows from structural admission or native schema recovery.

`scripts/public-dataset-packs.ts` deterministically generates the four packs;
`--check` refuses stale artifacts. Existing export/check and microsite catalog
tooling consume them without a new extension version or generator registry.
