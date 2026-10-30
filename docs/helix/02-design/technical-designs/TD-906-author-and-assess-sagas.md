---
ddx:
  id: TD-906
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-906
      kind: derived_from
    - id: SD-901
      kind: informed_by
    - id: CONTRACT-908
      kind: references
  schemas:
    - id: umf.actions.saga
      version: "0.1.0"
      title: Saga declarations
      path: docs/helix/02-design/contracts/schemas/saga-0.1.0.schema.json
      schemaFormat: json-schema
---

# TD-906: Author and assess sequential sagas

**User Story:** [[US-906-author-and-assess-sagas]] | **Feature:** [[FEAT-901-saga-semantics]]
**Solution Design:** [[SD-901-saga-semantics]]

## Scope

Portable declare/read/write/inspect/edit/assess behavior. No host scheduling,
business evaluation, physical binding selection or execution evidence collection.
CONTRACT-908 and its declaration schema own all shared signatures and shapes.

## Technical Approach

Admit one copied current-core Document with the existing core/registry pipeline.
Index modules, fields, keys and actions once within that immutable analysis.
Reuse the Rust action inspection family's original parameter/reference/value
semantics. Traverse ordered saga steps, build deterministic obligation IDs from
JSON Pointer paths, and diagnose missing/duplicate IDs before resolving mappings.

For each mapping, compare exact qualified Field or Record/Key identity and
requiredness. Track availability by completed-prefix position; compensation
inputs cannot depend on a later step. Do not infer type compatibility from
scalar family or from provider configuration. Runtime values remain separately
admitted on each invocation.

Malformed known data produces errors. Unknown semantics survive and produce
unchecked obligations. The initial safe edit subset conservatively requires a
fully interpreted Document before/after the copy; it does not guess dependency
independence through native unknown metadata. No parse/write path strips it.

Capability comparison is a separate pass over the same exact source and selected
identity. It cannot convert evidence links or action support into coordination
support, and it always leaves executionVerified false. Bound source/claim tables
before traversing; a limit yields explicit failure, never a supported prefix.

## Component Changes

All paths below are planned implementation locations, not delivered source.

| Module | Owned work | Dependency rule |
| --- | --- | --- |
| `crates/umf-codegen/src/actions/saga/mod.rs` | Public Rust saga operation facade and immutable analysis lifetime | Parent action inspection and core values only. |
| `.../saga/structure.rs` | Package/definition admission and preservation diagnostics | Generated model/package data and existing core admission. |
| `.../saga/references.rs` | Exact order, parameter identity, availability and mapping checks | Shared action inspection; no native provider types. |
| `.../saga/assessment.rs` | Claim comparison and deterministic bounded obligations | Immutable analysis; no network, clock, authority or database lookup. |
| `src/extensions/actions/saga.ts`, core bindings | Typed presentation of the same Rust operations | Shared wire/public engine; no independent semantic evaluator. |
| Metamodel/package compiler inputs | Promote reviewed shapes into generated packages/types | ADR-005; proposal sources are not handwritten production generated output. |

The architecture owns construction and allowed imports. Hosts construct registries
with exact trusted interpretation. Extending `bun run check:rust-boundaries` must
add negative controls for saga host APIs, native drivers and wrapper semantic
forks BEFORE source implementation can claim readiness. Existing checker success
alone does not cover these new paths. TypeScript reference code may be used only
as differential evidence until its operation family is retired.

## API/Interface Design

Use CONTRACT-908's Inspect/Declare/Edit/Assess operations. Existing read/write,
registry and validation interfaces keep their contracts. No URL fetch, implicit
package installation, business hook or general expression language is added.
Bun, native CLI/Python and browser WASM consume the same semantic operation family.

## Integration Points

Register only trusted generated extension metadata/validators through the existing
registry. Carry complete unknown extension data across native/Bun/browser wire
round trips. Keep prepared source indexes scoped to their immutable Document;
caller mutation cannot change cached interpretation or earlier results.

## Security

Artifact payload is untrusted data. Refuse accessors, unsupported host objects and
lossy literals through existing admission. Never invoke a handler, load an
artifact-named module or resolve remote references. Profiles are claims only;
current host authority is outside this slice.

## Performance

Indexing is linear in the admitted source; reference lookup is indexed per
module/identity. A selected definition has at most 32 steps. Avoid rescanning the
whole Document per mapping or copying its full graph per obligation. Return one
copied source and bounded diagnostic/obligation vectors. Protocol bounds are
specified in CONTRACT-908; no latency target is asserted without measurements.

## Testing

US-906-AC1 through US-906-AC16 govern this slice; STP-906 maps all 16 ACs to planned semantic cases and Bun/Chromium parity. The
adjacent example verifier checks only proposal-schema structure and negative
shape controls. It does not certify safe edits, Field compatibility or browsers.
Native/Bun/Chromium tests must compare the same immutable source and independently
specified expected diagnostics, not merely agreement among wrappers.

## Formal Specification

This slice consumes saga-scoped formal-methods practice but does not execute the
coordinator model for pure schema/reference algorithms. Those obligations are
covered by independent fixture expectations and mutation controls. TD-905 maps
coordination properties and their native residuals; schema success cannot
discharge them.

## Migration & Rollback

No existing action/core version changes. New declarations are opt-in. Retire
new semantic admission on rollback while preserving complete source and unknown
payload. No downgrade drops the saga extension or relabels it as an atomic action.

## Schema Basis

Reuse inspected core 0.10.0, actions 0.1.0 Parameter/Field/Key and existing tx/1
meaning. Only saga composition is added. Contract/schema references above are
normative; no duplicate local value model or evaluator is authorized.

## Risks

The existing shared Rust action inspector is generator-internal. Promote only
its narrow immutable declaration/obligation interface needed by saga analysis;
do not expose generator internals or fork its rules. Native wrappers need new
operation-family qualification rather than inheriting unrelated engine evidence.
