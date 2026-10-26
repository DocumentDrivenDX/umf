---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.operation-resource-root-interface-decision
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.resource-authority-closure-decision
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.versioned-core-operation-resource-authority
      kind: informed_by
---

# Versioned operation-resource root interface decision

## Decision

Represent each generated operation schema as a closed, model-declared resource
root and output binding. A resource declaration has exactly `path`, `id`,
`title`, ordered `externalResourceIds`, ordered `definitions` entries of
`{name, shape}`, and `root`. For the initial Facets/Cardinality slice,
`externalResourceIds` contains exactly `urn:umf:core:0.10.0`, the ID of the
canonical generated core schema output. This explicitly admits the existing
cross-resource references without adding another operation-resource
declaration. Shapes use the existing neutral metamodel shape vocabulary; they
do not contain JSON Schema documents or arbitrary keyword passthrough. Local
links resolve only within the resource's definitions; external links resolve
only to a listed ID. Resource paths are unique, relative, and confined to
`spec/core/*.schema.json`. The compiler emits exactly the declared paths, in
declaration order, and the build adapter accepts only those model-declared
outputs.

The generated document key order is fixed as `$schema`, `$id`, `title`,
`$defs`, then root-shape keywords. The definition sequence controls `$defs`
member order. The compiler uses a fixed object-keyword order, retaining reviewed
canonical ordering without accepting arbitrary schema keywords or a
model-controlled `keywordOrder` field. For the current Facets and Cardinality
resources, nested objects preserve the existing order `type`,
`additionalProperties`, `required`,
`properties`, `dependentRequired`, `minProperties`, followed by conditional
keywords where present. This order is a fixed compiler rule, not a model
`keywordOrder` field. The neutral object shape gains only a nonnegative
`minProperties` bound, emitted after `dependentRequired`; absent values emit no
keyword. This preserves Facets' current `minProperties: 1` requirement while
Cardinality's request remains without that keyword.

Cardinality v4 uses one schema fragment in its conditional branch whose
`required` and `properties` keywords intentionally have no `type` or
`additionalProperties`. The resource-only neutral `object-fragment` shape is
allowed only beneath a resource conditional's `condition` or `yes` subtree. It
has exactly `tag`, optional ordered `required`, and optional ordered
`properties`, with at least one of the latter two; `properties` maps names to
neutral shapes. It emits only `required` then `properties`, when present. It is
rejected in existing canonical core,
reference, package, constraint, and domain declarations.

The ordered root and definition declarations determine `$defs` and root output
placement. `$schema`, `$id`, and `title` are output-binding fields rather than
shape keywords. The metamodel output manifest associates every generated path
and content hash with the shared model/compiler provenance; operation schemas
do not receive an injected `$comment`, because that would prevent byte-for-byte
comparison with the present resources. The manifest is the provenance record
for each path/hash pair.

## Current authority boundary

CONTRACT-080 now freezes this resource-root interface, and the Rust compiler
parses the model declarations, validates the closed shape and output-binding
grammar, and emits both declared paths. `scripts/metamodel/build.ts` admits only
the two frozen additional paths. The metamodel vocabulary is 1.1.0. The
generated manifest records both schema path/hash pairs alongside the common
model and compiler source provenance; no schema `$comment` is injected.

The generated operation resources match their current checked-in bytes exactly:

| Resource | Bytes | SHA-256 |
|---|---:|---|
| `spec/core/facet-operation-v3.schema.json` | 5,292 | `74c1ca75e2bac44afd0010292b82741618e9cb031cc37159667fa4f4ff95fd9f` |
| `spec/core/cardinality-operation-v4.schema.json` | 3,666 | `c2562ad726b58306c18332512f2b5388ddc625abb7494c532794682492300d45` |

With Rust 1.90.0, `cargo test --locked --offline -p umf-metamodel`
passed 25 unit and 5 integration tests in an independent Sol rerun.
`UMF_METAMODEL_CACHE_DIR=/private/tmp/umf-opresource-cache bun
scripts/metamodel/build.ts --check` passed on the pre-capture-edit source cut.
The generated manifest is source-bound, so concurrent capture changes require
another check and regenerated provenance before this source can be archived.

Tests also reject a mismatched path/ID pair and an `object-fragment` outside a
conditional subtree. Reversing model declaration order reverses generated
operation-output order while preserving each resource's bytes. The top-level
metadata order, ordered `$defs`, object keyword order, and Facets-only
`minProperties` are covered by the exact byte comparison. This bounded output
slice supplies current writer evidence for these two resources only. The last
coordinated ledger recorded 17 unresolved aliases across 11 resource files;
that historical count must be recomputed against this source closure before any
retirement count changes. No route retirement or general runtime parity claim
follows from this work.

## Evidence inspected

CONTRACT-080's 2026-10-26 amendment and the checked Rust implementation define
the closed operation-resource interface. The Cardinality conditional includes
one schema fragment that cannot emit `type` or `additionalProperties`; it is
represented by the resource-only `object-fragment` grammar and constrained to
conditional `condition`/`yes` subtrees. The implementation retains the existing
canonical operation-schema bytes while binding them to model/compiler
provenance. The historical one-off writer remains historical evidence and is
not the authority basis for other resources.
