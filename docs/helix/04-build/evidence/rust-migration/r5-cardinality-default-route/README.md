---
ddx:
  id: umf.evidence.rust-migration.r5-cardinality-default-route
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 cardinality default-route admission decision

The cardinality default binder remains qualified only for the bounded frozen
source cases in the existing predecessor packet. It continues to call
`src/model/json.copyJson` before Rust dispatch so the public host error class,
message, path and refusal order remain predecessor-compatible. The experimental
selector-retirement attempt is not a cutover and no Node/WASM or Chromium
selector-retirement claim is made here.

The crossed-control differential is in
[`r5-cardinality-default-route.test.ts`](../../../../../../tests/rust-migration/r5-cardinality-default-route.test.ts).
It compares `copyJson` with direct generic Node model dispatch for hidden and
accessor properties, cycles and invalid numbers. The accessor getter remains
uninvoked. Generic `toWire` does not preserve predecessor error class/path:
hidden/accessor property failures lose the member path; a cycle is reported as
structural resource exhaustion at a repeated descendant instead of `CYCLE` at
the first repeated reference; and invalid numbers emerge as a core error with
an empty path rather than predecessor `UmfError NUMBER` at the offending value.
Sparse arrays and custom prototypes happened to match in the first controls,
but that does not establish host admission parity. The frozen cardinality
packet separately retains request-before-source, source-before-identity,
receipt-before-current and getter-count controls.

The reusable interface decision is that generic `toWire` keeps its existing
`AdmissionError` contract and cannot stand in for predecessor host admission.
A TypeScript copy adapter would preserve compatibility but leave this admission
step JavaScript-owned. Full Rust-owned parity requires the Rust-driven opaque
host-reflection interface in
[`host_json.rs`](../../../../../../crates/umf-core/src/host_json.rs), including
its ordered reflection events, active-handle cycle detection, UTF-16 paths and
per-invocation `Context`; cardinality must adopt that interface after its
Node/WASM wrappers expose the relevant operations. Until then the selector
must retain the TypeScript copy step.

The focused Bun check is:

```sh
bun test ./tests/rust-migration/r5-cardinality-default-route.test.ts
```

This packet records a blocker and a next-interface decision. It does not claim
new Rust-owned cardinality host admission, installed artifact parity, native
equivalence, or real Chromium qualification.
