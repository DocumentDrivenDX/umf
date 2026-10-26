---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.core-selection-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-045
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: TD-044
      kind: informed_by
    - id: TD-045
      kind: informed_by
---

# R8 authority review: composed core selection schemas

## Findings and proposed dispositions

The four current schemas are not outputs of the present metamodel generator,
and no exact current writer or complete input closure was found for them.
Three rows should remain `authority-unresolved`. The semantic-types selection
schema has a defensible direct-authority case: CONTRACT-078 explicitly names
`spec/core/semantic-types-selection.schema.json` as a published schema and
defines the semantic-types operation and versioned source boundary. Its current
file bytes are the same as at the introducing commit. I propose classifying
that one resource `authored-known` with CONTRACT-078 as its governing authority.
This is source authority only; it does not establish implementation or runtime
equivalence.

| Resource | Current `$id` | Current status recommendation | Evidence basis |
| --- | --- | --- | --- |
| `spec/core/key-selection.schema.json` | `urn:umf:core:element-selection:0.6.0` | Keep `authority-unresolved` | TD-044 requires a 0.6.0 selection schema with membership and key-component boundaries, but does not name the exact file; later current-reference edits have no exact writer. |
| `spec/core/relationship-selection.schema.json` | `urn:umf:core:element-selection:0.7.0` | Keep `authority-unresolved` | CONTRACT-045 defines selection behavior and TD-045 describes relationship evolution, but neither establishes current bytes of this exact path as directly authored. It is a composite selection snapshot. |
| `spec/core/schema-properties-selection.schema.json` | `urn:umf:core:schema-properties-selection:1.0.0` | Keep `authority-unresolved` | CONTRACT-049 governs schema properties but does not name this selection schema; no exact current writer was found. |
| `spec/core/semantic-types-selection.schema.json` | `urn:umf:core:semantic-types-selection:2.0.0` | Propose `authored-known` | CONTRACT-078, Published schemas, explicitly names this exact file; current bytes match the file introduced with the semantic-types restoration commit. |

## Composite boundary and writer search

The selection resources share the common element-selection result structure,
including source validation, selected elements, and boundary arrays. The
Key and Relationship filenames are historical export names for versioned
`element-selection` schemas; their `$id` values confirm that the file content
is a core element-selection result, not a standalone Key/Relationship
operation. Schema-properties adds its operation-specific selection identity;
semantic-types adds its own versioned identity. These similarities describe
composition and do not establish a generator.

The present `scripts/core-selection-schema.ts` writes only
`spec/core/element-selection.schema.json` with `$id`
`urn:umf:core:element-selection:0.10.0`. It does not write any of the four
versioned resources. `scripts/metamodel/build.ts` and
`spec/metamodel/generated/manifest.json` likewise list none as outputs or
sources. The current model's `src/model/selection-schemas.ts` imports the files;
that is consumption evidence, not generation authority. No exact writer or
deterministic source-composition closure for the specialized files was found.

For Key, TD-044 directs adding a 0.6.0 selection schema with separate
membership and key-component boundaries. The current schema has those
boundaries, but its later modification in the metamodel-current-definition
commit changes source-reference details without a matching exact writer.
Relationship selection similarly combines the shared element-selection form
with relationship/reference boundary data. CONTRACT-045's selection semantics
do not name this JSON file as the authority for every current shape. These
composites remain unresolved until the exact source portions and deterministic
writer are pinned or governing artifacts directly establish the exact current
resources.

## Authoring and historical pins

Each row below distinguishes the historical introducing blob from the current
working-tree bytes. The first three files were later modified in
`8706814a9605d7325eef32a5df3d05696de00b62`, which changed their core source
references. `semantic-types-selection` was introduced by
`f397e484727cc7405958c9ec40468cf6134e48e3`; its current bytes match that
introducing blob.

| Resource | Introducing commit | Introducing blob SHA-256 | Current SHA-256 |
| --- | --- | --- | --- |
| `spec/core/key-selection.schema.json` | `280d3449b95ae32d378f1c379918b7c139d52de9` | `1f7dd4aafe576d5d56e8632d954f33776ab25b462a46ab3eebe5c8f425c195a4` | `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` |
| `spec/core/relationship-selection.schema.json` | `887d67410b42ffc58d8f0853185b33a603320e19` | `c9f1f537bb64326b0e8e622b29d51c5af9c9f8b9ae78f4cf3b46cd6a628c2287` | `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` |
| `spec/core/schema-properties-selection.schema.json` | `436e975d5e8b6b395efb45685deb5eff0f481d45` | `a91d735e8303ebc376a8119ccd8e10d9bd02b49343a9967e3061414d8a5daa8b` | `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` |
| `spec/core/semantic-types-selection.schema.json` | `f397e484727cc7405958c9ec40468cf6134e48e3` | `529d97cfd8ff7b5e201967c7156dc8c9439d5984ac1ee755bdb60a2d505bdead` | `529d97cfd8ff7b5e201967c7156dc8c9439d5984ac1ee755bdb60a2d505bdead` |

The present generator and consumer pins are:

| Source | SHA-256 |
| --- | --- |
| `scripts/core-selection-schema.ts` | `77929f46400989e3875b6a53b33e2a8908173ad49ffe62612f831a006d7418ba` |
| `scripts/metamodel/build.ts` | `f2a0b2f18c09b8bcff2099d4cadd20a7d91017b53ccfa2596226818189f054c3` |
| `spec/metamodel/generated/manifest.json` | `100bc7b1ff47e178be1aa8083650e5a59095242689284c52d9b9297cbe18f3aa` |
| `src/model/selection-schemas.ts` | `ff3c71047d7eeb6faeafc038856a7fb7b9ae08d3e20cfe735298f352e0a705b0` |
| `docs/helix/02-design/contracts/CONTRACT-045-cross-document-references.md` | `8f57a3196666942fcf0edd70dcb32cd83ac5a605c1ac470f4356a564ad12558f` |
| `docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md` | `6ced1294f64710b4a70edcaec1d470b17834b5b1a63c10ed3df70e07be1bd9f1` |
| `docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md` | `380b7193e747603d5e5bc4ee295e3a8cd9d1ac17c160130cec0da657a278ff82` |
| `docs/helix/02-design/technical-designs/TD-044-core-key.md` | `396760c64c1e19f694cd80e9552378ad5ca0e9d0964756c90bd26921361b9e95` |
| `docs/helix/02-design/technical-designs/TD-045-relationship.md` | `dcb8dffcbdf2b8966a25ff04d640d23f56c991e99156649024e29741cd522468` |

## Limits

This review establishes source authority only. It does not qualify SDK archive
or installed bytes, the public browser route, selection result behavior, or
Rust parity. The direct-authority proposal for semantic types is limited to
the exact named 2.0.0 schema under CONTRACT-078. The other three resources
remain unresolved despite consumer imports, historical presence, and matching
composite structure. No metamodel check was rerun while the shared source
cohort is moving, and no generated output was rewritten.
