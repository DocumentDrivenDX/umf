---
ddx:
  id: TD-051
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-051
      kind: informed_by
---

# TD-051: Core semantic type references

## Scope

Implement the owner's generic pointing capability in experimental core 0.9.0
on the 0.8.0 schema-properties branch (PR #1). Domain definitions, validator
algorithms and TableSpec inference remain publisher-owned follow-up work.
CONTRACT-051 replaces this chat's uncommitted CONTRACT-049 allocation because
concurrent work already used that ID. Architecture is the parent design.

## Technical Approach

Publish a new document schema by extending the 0.8.0 surface without editing
older schemas. Reuse the prototype's exact identity registry and explicit value
validator boundary. The document validator checks reference shape independently
of installed vocabularies; it always reports external semantic interpretation as
incomplete when references are present. Unknown qualifiers retain path diagnostics.
An explicitly requested value check uses the separate semantic registry.

Reuse 0.8.0 schema-property/relationship validation on private views, removing
only the newly recognized element field. Ensure extension semantic callbacks
receive the complete 0.9.0 document, including semantic references and shared
schema properties; a private view must never escape as a public downgrade.
Element selection retains full source and annotations, without traversing semantic
terms as module/element references. Publish a version-specific selection schema.

## Component Changes

- `spec/core/`: document, reference, operation, transition and selection schemas.
- `src/model/`: typed inspection/authoring, source-retaining declaration receipts,
  explicit 0.8.0 upgrade and verified rollback; separate extension migration policy.
- `src/validation/`: 0.9.0 dispatch, inherited validation and incomplete semantics.
- `src/index.ts`: public types, APIs and schemas; retain prototype API signatures.
- `tests/semantic-types/` and browser script: core, legacy, mutation and recovery cases.

## API/Interface Design

CONTRACT-051 owns exact signatures and receipt shapes. Inspection reads older
opaque fields as legacy, never as interpreted semantic declarations. Authoring
is limited to 0.9.0 and requires explicit identities. Existing version-specific
kind/nullability/cardinality/facet/key/relationship and 0.8.0 property operations
keep their published version limits and explicitly refuse unsupported 0.9.0
operations; no cast or silent envelope downgrade is an authoring workaround.
Core read/write, validation, element selection and semantic-type operations support
0.9.0. Extending other authoring receipts is a separately versioned task.

## Testing

Write failing core tests before runtime edits. Cover no-registration structural
validation, absence/empty/malformed references, exact namespaces/releases, competing
terms, unknown qualifiers, incomplete AND evaluation, native/unknown preservation,
getter refusal, copied edits, wrong versions/identities, and stale declarations.
Validate source/target receipts against published schemas after both serializations.
Upgrade tests archive every old lookalike; opt-in extension migration refuses
collisions, unsupported profiles, malformed payloads and unknown annotation-level
qualifiers. Rollback recomputation rejects forged receipts and changed IDs while
retaining edited current documents separately. Chromium executes the public bundle.
Independent Python schema validation compares shape cases against the published
0.9.0 schema; it does not establish external term meaning or native equivalence.

## Migration & Rollback

Only 0.8.0 upgrades directly to 0.9.0. Older versions use existing explicit
migration stages first. Default upgrade archives/removes opaque element fields
and preserves the full original document. Extension conversion requires explicit
opt-in, retains the original payload, and never silently merges a collision.
Rollback restores the exact original 0.8.0 source; later content remains in the
rollback receipt's current-source archive. Receipt verification establishes
internal consistency, not authenticity of a submitted source.

## Implementation Sequence

1. Settle contract and plan; add failing core tests.
2. Publish schemas, model types, validation and typed operations.
3. Implement upgrade, opt-in conversion, rollback and receipt verification.
4. Integrate selection; run Bun/type/schema checks, independent schema oracle,
   browser and regression tests. Review unknown handling and receipt mutations.
5. Record evidence and create a stacked PR targeting the core-properties branch.

## Risks

The dependency PR may change before merge: rebase and rerun affected checks.
Historical evidence fingerprints may drift after governed-document edits: report
those failures separately and never rewrite old acceptance evidence as a new pass.
Catalog trust/version policies and native parity remain open, without blocking
structural core references or justifying a universal domain validator claim.
