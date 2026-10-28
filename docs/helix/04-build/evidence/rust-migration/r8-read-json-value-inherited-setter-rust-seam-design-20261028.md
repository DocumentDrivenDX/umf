---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-inherited-setter-rust-seam-design-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-inherited-setter-source-oracle-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
      kind: informed_by
---

# R8 inherited array-index setter: Rust seam assessment

## Decision

Do not implement a parser-phase host callback seam in this turn. A callback
added at the Rust YAML event or value-builder boundary could invoke a host
setter, but the evidence does not establish that such a callback is causally
equivalent to the TypeScript parser's write sites. The current implementation
uses the vendored `saphyr-parser` event stream and constructs values in
`crates/umf-core/src/serialization.rs::parse_yaml_events` / `add_yaml_value`;
the predecessor routes use the separate `yaml` parser and expose line-start,
stream, flow-collection, and compose resolver phases. Calling the setter a
fixed number of times after parsing would reproduce one counter only and
would fail the observed mutation and throw-order behaviors.

This is a concrete implementation blocker, not a claim that a Rust parser seam
is impossible. A future seam needs an owned parser callback contract and a
source-oracle matrix that maps each Rust callback to the predecessor event that
causes it, including construction, parser errors, mutation and thrown values.
Until then the dedicated Rust route remains opt-in and the inherited-setter
case remains a counted mismatch (17/18) on Node and Bun.

## Evidence and exact observed order

The source-oracle packet covers 20 input shapes and Node 26.12.1 / Bun 1.4.3.
For `[41,42]`, the predecessor performs five inherited setter calls in order:

1. `parser.parse.line-start`
2. `parser.stream`
3. `parser.flowCollection`
4. `parser.flowCollection`
5. `compose.resolveFlowCollection`

The successful parse returns `[41,42]`. A one-shot sentinel thrown at calls
1–4 escapes by identity at that point. A sentinel thrown at call 5 is caught
inside collection resolution and converted to `UmfError` with code `SYNTAX`;
the parser then invokes `compose.composeNode.error-record` as call 6. If that
error-record callback throws, its exact sentinel escapes. `throw undefined`
has the same boundaries and must be distinguished from a normal return.
Always-throw stops at call 1. The receipts separately preserve the TypeError
when a mutation omits creation of the own array index; it is not an
implementation strategy.

These traces are specifically the TypeScript parser's observable internals.
The Rust parser currently yields `Event::{StreamStart, DocumentStart,
SequenceStart, Scalar, SequenceEnd, ...}`; its builder pushes values into
Rust `Vec`s. Neither interface exposes the predecessor's five named write
sites or its resolver catch boundary. Mapping Rust events by name is not
enough: multiple predecessor calls can occur within one flow collection, and
the final callback has different exception handling from the first four.

## Required seam design before implementation

1. Define a private Rust callback trait for an invocation-scoped setter event
   and a distinct parser error-record event. Each callback must preserve the
   original host array and exact thrown-value token; no callback result may be
   reconstructed from text.
2. Place callbacks at parser operations that are shown, by source inspection
   and differential traces, to correspond to predecessor array writes. Do
   not dispatch from a post-parse count or from a case-specific input shape.
3. Make the resolver boundary explicit: callbacks in the pre-resolution
   phases propagate exact host throws; a resolution callback throw is caught
   as the predecessor catches it and converted to the same `SYNTAX` error;
   the subsequent error-record callback is then invoked, with its throw
   escaping unchanged.
4. Preserve array mutation effects and descriptors. The host callback must
   perform the actual inherited property write at the original time. A
   synthetic notification that does not participate in parser mutation is
   insufficient.
5. Add frozen traces for all 20 source-oracle shapes, including empty and
   nested collections, mapping-contained arrays, setter mutation of length and
   index, no-own-index mutation, one-shot/always throws, `throw undefined`,
   and throw-at-resolution plus throw-at-error-record. Compare value shape,
   order, identity, class/code/path/message and callback trace in Node and Bun.
6. If the Rust parser cannot naturally provide the required write/evaluation
   points, do not simulate them. Either choose a parser architecture that can
   retain those callbacks with evidence-backed correspondence, or keep this
   profile on TypeScript and record the bounded Rust mismatch.

## Existing boundary and remaining unknowns

CONTRACT-001 requires faithful JSON-compatible YAML parsing and explicit
diagnostics; it does not promise compatibility with arbitrary mutation of
`Array.prototype` during parsing. The narrow Rust experiment nevertheless
measures that host-observable behavior and must report it accurately. CONTRACT-011
preserves OpenAPI native source and is adjacent context only; this seam does
not expand OpenAPI support. The existing ordinary-profile Rust binding handles
primitive strings and currently reconstructs the result from the Rust value
frame, so callbacks into the original JS array cannot be attached without
extending that binding protocol and the value-construction boundary.

Unknown and therefore blocking for a faithful seam: whether the Rust event
stream can be instrumented to align with every predecessor setter site;
whether Rust-side array construction can preserve real host writes without
changing ordinary result construction; and whether the phase-to-catch mapping
holds beyond the retained finite matrix. No parser callback experiment was
run and no code or prior evidence was changed for this assessment.

## Inputs consulted

- `docs/helix/README.md`, `.helix.yml`, and the shared Rust implementation
  plan execution evidence in `docs/helix/04-build/rust-migration-plan.md`.
- CONTRACT-001, CONTRACT-011, TP-001 and ADR-006.
- The ordinary 59-case acceptance packet, 18-case opt-in Rust replay and
  inherited-setter source oracle in `docs/helix/04-build/evidence/rust-migration/`.
- Current binding files `bindings/core/node/src/read_json_value.rs` and
  `bindings/core/node/src/read_json_value_host.rs`, core acquisition code in
  `crates/umf-core/src/read_json_value_host.rs`, and parser/value construction
  in `crates/umf-core/src/serialization.rs`.
