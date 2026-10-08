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
synthetic generation for external row bindings; its explicit local CSV reader
performs typed ingestion without a fabricated fallback. Arbitrary retrieval and
mixed-data transformation are not part of this first execution subset.

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
